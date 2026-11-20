import {
  BUILT_IN_PAGE_TEMPLATE,
  PAGE_TEMPLATE_FIELD,
  coverBlocks,
  numberHeadings,
  resolvePageTemplate,
  validateDocument,
  validateStylesheet,
  type Diagnostic,
  type Document as StanzaDocument,
  type Stylesheet,
  type LinkSchemes,
} from '@stanza/core';
import { Document, Packer } from 'docx';
import { buildBlocks, type BuildContext, type ReferenceFile } from './content.js';
import { footerOf, headerOf } from './header-footer.js';
import { ListNumbering } from './list-numbering.js';
import { pageGeometry } from './page.js';
import { finishPackage } from './package.js';
import { RunStyles } from './run-styles.js';
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
}

export interface ExportResult {
  /** Undefined when there were errors. */
  readonly bytes: Uint8Array | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

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
  const children = buildBlocks(document.blocks, context);
  const coverChildren =
    template.cover === undefined
      ? []
      : buildBlocks(coverBlocks(template.cover, document.meta), { ...context, headingLabels: [] });
  const hasCover = coverChildren.length > 0;
  if (hasErrors(diagnostics)) return { bytes: undefined, diagnostics };

  const { title, authors } = document.meta;
  const counting = { hasCover };
  const header = headerOf(template.header, document.meta, page, counting);
  const footer = footerOf(template.footer, document.meta, page, counting);
  const pageProperties = {
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
  const file = new Document({
    ...(title !== undefined ? { title } : {}),
    ...(authors !== undefined
      ? { creator: authors.join('; '), lastModifiedBy: authors.join('; ') }
      : {}),
    externalStyles: tableStylesXml(stylesheet),
    styles: {
      paragraphStyles: [...declared.paragraphStyles, ...context.lists.styles()],
      characterStyles: [...declared.characterStyles, ...context.runs.styles()],
    },
    ...(context.lists.config().length > 0 ? { numbering: { config: context.lists.config() } } : {}),
    sections: [
      ...(hasCover ? [{ properties: { page: pageProperties }, children: coverChildren }] : []),
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
    }),
    diagnostics,
  };
}
