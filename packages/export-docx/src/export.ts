import {
  numberHeadings,
  validateDocument,
  validateStylesheet,
  type Diagnostic,
  type Document as PhraseDocument,
  type Stylesheet,
} from '@phrase/core';
import { Document, Packer } from 'docx';
import { buildBlocks, type BuildContext } from './content.js';
import { ListNumbering } from './list-numbering.js';
import { finishPackage } from './package.js';
import { RunStyles } from './run-styles.js';
import { wordStyleId } from './style-ids.js';
import { checkStyleIds, declaredStyles, pageBreakStyles } from './styles.js';
import { tableStylesXml } from './table-styles.js';

export interface ExportOptions {
  /** Written into the package, so the same inputs give the same bytes. */
  readonly timestamp: Date;
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
  document: PhraseDocument,
  stylesheet: Stylesheet,
  options: ExportOptions,
): Promise<ExportResult> {
  const diagnostics: Diagnostic[] = [...validateStylesheet(stylesheet)];
  if (!hasErrors(diagnostics)) diagnostics.push(...validateDocument(document, stylesheet));
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
  const context: BuildContext = {
    stylesheet,
    runs: new RunStyles(stylesheet, ids, diagnostics),
    lists: new ListNumbering(stylesheet, ids, diagnostics),
    headingLabels: numberHeadings(document, stylesheet).labels,
    diagnostics,
  };
  const children = buildBlocks(document.blocks, context);
  if (hasErrors(diagnostics)) return { bytes: undefined, diagnostics };

  const { title, authors } = document.meta;
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
    sections: [{ children }],
  });
  const packed = new Uint8Array(await Packer.toArrayBuffer(file));
  return {
    bytes: finishPackage(packed, {
      timestamp: options.timestamp,
      pageBreaks: pageBreakStyles(stylesheet),
    }),
    diagnostics,
  };
}
