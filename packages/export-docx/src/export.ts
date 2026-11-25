import {
  BUILT_IN_PAGE_TEMPLATE,
  PAGE_TEMPLATE_FIELD,
  numberHeadings,
  resolvePageTemplate,
  validateDocument,
  validateStylesheet,
  type Diagnostic,
  type Document as StanzaDocument,
  type ImageAsset,
  type Stylesheet,
  type LinkSchemes,
  type ReviewProtection,
  type SourceStamp,
} from '@stanza/core';
import { Document, Packer } from 'docx';
import { buildBlocks, type BuildContext, type ReferenceFile } from './content.js';
import { buildCover, buildTitleBlock } from './cover.js';
import { footerOf, headerOf } from './header-footer.js';
import { ListNumbering } from './list-numbering.js';
import { pageGeometry, type PageGeometry } from './page.js';
import { finishPackage } from './package.js';
import { RunStyles } from './run-styles.js';
import { finishedStamp, stampProperties } from './stamp.js';
import { wordStyleId } from './style-ids.js';
import { checkStyleIds, declaredStyles, pageBreakStyles } from './styles.js';
import { tableStylesXml } from './table-styles.js';

export interface ExportOptions {
  readonly linkSchemes?: LinkSchemes;
  /** Written into the package, so the same inputs give the same bytes. */
  readonly timestamp: Date;
  /**
   * The blocks of the other documents of the project, by ID, with the DOCX file of the document
   * that holds each. A reference to one of them is a link to that file (ADR 0073). Without it the
   * document stands alone, and a reference must point at a block of its own.
   * File-only Stanza links are keyed by their complete source href instead of an ID.
   */
  readonly otherTargets?: ReadonlyMap<string, ReferenceFile>;
  /**
   * The source of the document and its revision, stamped into the package so that a pull of review
   * comments finds the reviewed version (ADR 0084). Without it the package has no stamp.
   */
  readonly source?: SourceStamp;
  /**
   * How the package is protected (ADR 0085): `comments`, the default, lets a reviewer only comment
   * (ADR 0030); `none` leaves it open, so that Word for the web can comment on it at all.
   */
  readonly protection?: ReviewProtection;
  /**
   * The images that covers show, by their path in the project (ADR 0089). The project reads them;
   * a cover image that is not here is an error.
   */
  readonly images?: ReadonlyMap<string, ImageAsset>;
}

export interface ExportResult {
  /** Undefined when there were errors. */
  readonly bytes: Uint8Array | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

/** The size and margins of a section, as the library wants them. */
function sectionPage(page: PageGeometry) {
  return {
    size: { width: page.widthTwips, height: page.heightTwips },
    margin: {
      top: page.marginTopTwips,
      right: page.marginRightTwips,
      bottom: page.marginBottomTwips,
      left: page.marginLeftTwips,
      header: page.headerTwips,
      footer: page.footerTwips,
    },
  };
}

/** Writes a validated document as a DOCX package with named styles. */
export async function exportDocx(
  document: StanzaDocument,
  stylesheet: Stylesheet,
  options: ExportOptions,
): Promise<ExportResult> {
  const diagnostics: Diagnostic[] = [...validateStylesheet(stylesheet)];
  const otherTargets = options.otherTargets ?? new Map<string, ReferenceFile>();
  if (!hasErrors(diagnostics)) {
    const checks =
      options.otherTargets === undefined ? {} : { projectIds: new Set(otherTargets.keys()) };
    diagnostics.push(
      ...validateDocument(document, stylesheet, {
        ...checks,
        ...(options.linkSchemes !== undefined ? { linkSchemes: options.linkSchemes } : {}),
      }),
    );
  }
  if (!hasErrors(diagnostics)) diagnostics.push(...checkStyleIds(stylesheet));
  if (hasErrors(diagnostics)) return { bytes: undefined, diagnostics };

  const declared = declaredStyles(stylesheet);
  const ids = new Set(
    [
      ...stylesheet.paragraphStyles.keys(),
      ...stylesheet.characterStyles.keys(),
      ...stylesheet.tableStyles.keys(),
    ].map(wordStyleId),
  );
  const selected = document.meta.fields[PAGE_TEMPLATE_FIELD];
  const template =
    resolvePageTemplate(
      stylesheet,
      typeof selected === 'string' && selected !== '' ? selected : undefined,
    ) ?? BUILT_IN_PAGE_TEMPLATE;
  const page = pageGeometry(template);
  const context: BuildContext = {
    stylesheet,
    page,
    runs: new RunStyles(stylesheet, ids, diagnostics),
    lists: new ListNumbering(stylesheet, ids, diagnostics),
    headingLabels: numberHeadings(document, stylesheet).labels,
    diagnostics,
    otherTargets,
    linkSchemes: options.linkSchemes ?? {},
  };
  const images = options.images ?? new Map<string, ImageAsset>();
  // The title block comes first in the body, before its content and its table of contents.
  const children = [
    ...buildTitleBlock(template, document.meta, images, context),
    ...buildBlocks(document.blocks, context),
  ];
  const cover = buildCover(template, document.meta, images, context);
  const hasCover = cover !== undefined;
  if (hasErrors(diagnostics)) return { bytes: undefined, diagnostics };

  const { title, authors } = document.meta;
  const counting = { hasCover };
  const header = headerOf(template.header, document.meta, page, counting);
  const footer = footerOf(template.footer, document.meta, page, counting);
  const pageProperties = sectionPage(page);
  const stamp = options.source === undefined ? undefined : finishedStamp(options.source);
  const file = new Document({
    ...(title !== undefined ? { title } : {}),
    ...(authors !== undefined
      ? { creator: authors.join('; '), lastModifiedBy: authors.join('; ') }
      : {}),
    ...(options.source !== undefined && stamp !== undefined
      ? { customProperties: stampProperties(options.source, stamp) }
      : {}),
    externalStyles: tableStylesXml(stylesheet),
    styles: {
      paragraphStyles: [...declared.paragraphStyles, ...context.lists.styles()],
      characterStyles: [...declared.characterStyles, ...context.runs.styles()],
    },
    ...(context.lists.config().length > 0 ? { numbering: { config: context.lists.config() } } : {}),
    sections: [
      ...(cover !== undefined
        ? [{ properties: { page: sectionPage(cover.page) }, children: [...cover.children] }]
        : []),
      {
        properties: {
          // The cover is not counted.
          page: { ...pageProperties, ...(hasCover ? { pageNumbers: { start: 1 } } : {}) },
        },
        ...(header !== undefined ? { headers: { default: header } } : {}),
        ...(footer !== undefined ? { footers: { default: footer } } : {}),
        children,
      },
    ],
  });
  const packed = new Uint8Array(await Packer.toArrayBuffer(file));
  return {
    bytes: finishPackage(packed, {
      timestamp: options.timestamp,
      pageBreaks: pageBreakStyles(stylesheet),
      textWidthTwips: page.textWidthTwips,
      protection: options.protection ?? 'comments',
      ...(stamp !== undefined ? { source: stamp } : {}),
      ...(cover?.rows === true ? { coverRows: true } : {}),
    }),
    diagnostics,
  };
}
