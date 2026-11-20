import type { SlotPart } from '@stanza/core';

/** The text of a slot as it is written in the stylesheet: tokens and fields as `[label](stanza:...)` links. */
export function slotSource(parts: readonly SlotPart[]): string {
  return parts
    .map((part) => {
      switch (part.kind) {
        case 'text':
          return part.text;
        case 'token':
          return `[${part.label}](stanza:${part.token})`;
        case 'field':
          return `[${part.label}](stanza:field:${part.name})`;
      }
    })
    .join('');
}
