import type { NodeId } from '@stanza/core';

/** Word bookmark names must start with a letter, and IDs can start with a digit. */
export function bookmarkName(id: NodeId): string {
  return `stanza_${id}`;
}
