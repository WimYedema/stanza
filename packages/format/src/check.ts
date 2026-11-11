import {
  applyDefaults,
  validateDocument,
  validateMetadata,
  type Diagnostic,
  type Document,
  type ProjectSettings,
  type Stylesheet,
} from '@phrase/core';
import { parseDocument } from './parse.js';

export interface CheckResult {
  readonly document: Document;
  /** Reading problems first, then problems found by checking the document against the stylesheet. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads a document and checks it against a stylesheet. Constructs the dialect cannot represent are
 * reported while reading, and nothing in the model can express direct formatting, so these two
 * sets of diagnostics cover everything that is unsupported or invalid. When the project settings
 * are given, the metadata is checked against them as well. With `projectIds`, a reference may point
 * at a block of another document of the project (ADR 0073).
 */
export function checkDocumentText(
  source: string,
  stylesheet: Stylesheet,
  settings?: ProjectSettings,
  options: { readonly projectIds?: ReadonlySet<string> } = {},
): CheckResult {
  const parsed = parseDocument(source);
  const metadata =
    settings === undefined
      ? []
      : validateMetadata(applyDefaults(settings, parsed.document.meta), settings);
  return {
    document: parsed.document,
    diagnostics: [
      ...parsed.diagnostics,
      ...validateDocument(parsed.document, stylesheet, options),
      ...metadata,
    ],
  };
}
