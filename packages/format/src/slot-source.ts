import type { SlotPart } from '@phrase/core';

/** The text of a slot as it is written in the stylesheet: tokens and fields as `[label](phrase:...)` links. */
export function slotSource(parts: readonly SlotPart[]): string {
  return parts
    .map((part) => {
      switch (part.kind) {
        case 'text':
          return part.text;
        case 'token':
          return `[${part.label}](phrase:${part.token})`;
        case 'field':
          return `[${part.label}](phrase:field:${part.name})`;
      }
    })
    .join('');
}
