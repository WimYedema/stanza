import {
  applyDefaults,
  validateDocument,
  validateMetadata,
  type Diagnostic,
  type Document,
  type ProjectSettings,
  type Stylesheet,
} from '@stanza/core';
import { parseDocument, type ParseResult } from './parse.js';

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
  return checkParsedDocument(parseDocument(source), stylesheet, settings, options);
}

/** Checks a document already parsed for a project index, without reading its source again. */
export function checkParsedDocument(
  parsed: ParseResult,
  stylesheet: Stylesheet,
  settings?: ProjectSettings,
  options: { readonly projectIds?: ReadonlySet<string> } = {},
): CheckResult {
  const metadata =
    settings === undefined
      ? []
      : validateMetadata(applyDefaults(settings, parsed.document.meta), settings);
  return {
    document: parsed.document,
    diagnostics: [
      ...parsed.diagnostics,
      ...validateDocument(parsed.document, stylesheet, {
        ...options,
        ...(settings?.linkSchemes !== undefined ? { linkSchemes: settings.linkSchemes } : {}),
      }),
      ...metadata,
    ],
  };
}
