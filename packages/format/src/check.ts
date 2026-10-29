import { validateDocument, type Diagnostic, type Document, type Stylesheet } from '@phrase/core';
import { parseDocument } from './parse.js';

export interface CheckResult {
  readonly document: Document;
  /** Reading problems first, then problems found by checking the document against the stylesheet. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads a document and checks it against a stylesheet. Constructs the dialect cannot represent are
 * reported while reading, and nothing in the model can express direct formatting, so these two
 * sets of diagnostics cover everything that is unsupported or invalid.
 */
export function checkDocumentText(source: string, stylesheet: Stylesheet): CheckResult {
  const parsed = parseDocument(source);
  return {
    document: parsed.document,
    diagnostics: [...parsed.diagnostics, ...validateDocument(parsed.document, stylesheet)],
  };
}
