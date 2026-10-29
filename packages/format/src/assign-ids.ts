import {
  assignMissingIds,
  type AssignIdsOptions,
  type Diagnostic,
  type NodeId,
} from '@phrase/core';
import { parseDocument } from './parse.js';
import { serializeDocument } from './serialize.js';

export type AssignIdsInTextResult =
  | {
      readonly ok: true;
      readonly text: string;
      /** The IDs that were added, in document order. */
      readonly assigned: readonly NodeId[];
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * Adds missing IDs to a document's text. The text must already be in canonical form, so that the
 * only change to the file is the added annotations. Otherwise nothing is changed and the reason is
 * reported.
 */
export function assignMissingIdsInText(
  text: string,
  options: AssignIdsOptions,
): AssignIdsInTextResult {
  const parsed = parseDocument(text);
  if (parsed.diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, diagnostics: parsed.diagnostics };
  }
  if (serializeDocument(parsed.document) !== text) {
    return {
      ok: false,
      diagnostics: [
        ...parsed.diagnostics,
        {
          severity: 'error',
          code: 'not-canonical',
          message: 'The file is not in canonical form. Format it before assigning IDs.',
        },
      ],
    };
  }
  const result = assignMissingIds(parsed.document, options);
  return {
    ok: true,
    text: result.assigned.length === 0 ? text : serializeDocument(result.document),
    assigned: result.assigned,
    diagnostics: [...parsed.diagnostics, ...result.diagnostics],
  };
}
