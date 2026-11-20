import { parseDocument, serializeDocument } from '@stanza/format';
import type { Reason } from '../shared/protocol.js';

/** The text of a document as the editor sees it: with `\n`, whatever line ending the file has. */
export const normalized = (text: string): string => text.replace(/\r\n?/g, '\n');

export type Review =
  /** The text is canonical and has nothing the model cannot hold. */
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly reasons: readonly Reason[];
      /** The canonical text, when the file can be made canonical without losing anything. */
      readonly formatted?: string;
    };

/**
 * Whether the visual editor can take a text (ADR 0003, ADR 0015). It must read without any
 * diagnostic, since each one marks something that the model cannot hold and that opening and saving
 * would lose, and it must be what the serializer writes, so that opening does not change it. The
 * line ending of the file does not count: the buffer is normalised, and the file keeps its ending.
 */
export function reviewText(text: string): Review {
  const source = normalized(text);
  const parsed = parseDocument(source);
  if (parsed.diagnostics.length > 0) {
    return {
      ok: false,
      reasons: parsed.diagnostics.map((diagnostic) => ({
        message: diagnostic.message,
        ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
      })),
    };
  }
  const canonical = serializeDocument(parsed.document);
  if (canonical === source) return { ok: true, text: source };
  return {
    ok: false,
    reasons: [
      {
        message:
          'The file is not in canonical form, so opening it in the visual editor would change it.',
      },
    ],
    formatted: canonical,
  };
}
