import type { DocumentMeta, SlotPart } from '@phrase/core';

/** The metadata value of a token or field, or undefined when it has none. */
export function slotValue(
  part: Exclude<SlotPart, { kind: 'text' }>,
  meta: DocumentMeta,
): string | undefined {
  if (part.kind === 'field') {
    const value = meta.fields[part.name];
    return typeof value === 'string' || value === undefined ? value : value.join(', ');
  }
  switch (part.token) {
    case 'title':
      return meta.title;
    case 'authors':
      return meta.authors?.join(', ');
    case 'classification':
      return meta.classification;
    // The version comes from build information, which does not exist yet.
    default:
      return undefined;
  }
}

/** The plain text of a slot, with the label of every token that has no value. */
export function slotText(parts: readonly SlotPart[], meta: DocumentMeta): string {
  return parts
    .map((part) => (part.kind === 'text' ? part.text : (slotValue(part, meta) ?? part.label)))
    .join('');
}
