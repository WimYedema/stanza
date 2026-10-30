import type { NodeId } from '@phrase/core';

/** Word bookmark names must start with a letter, and IDs can start with a digit. */
export function bookmarkName(id: NodeId): string {
  return `phrase_${id}`;
}
