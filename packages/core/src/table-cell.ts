import type { Inline, TableCell } from './document.js';

/** A cell of plain text: one paragraph, or no block at all when there is no text. */
export function plainCell(inlines: readonly Inline[]): TableCell {
  return { blocks: inlines.length === 0 ? [] : [{ type: 'paragraph', content: inlines }] };
}

/**
 * The text of a cell that is empty or one paragraph, which a pipe table can write. Undefined for a
 * cell that holds more, or a paragraph with an ID or a style, which a pipe table cannot say.
 */
export function plainCellInlines(cell: TableCell): readonly Inline[] | undefined {
  const [first, ...rest] = cell.blocks;
  if (first === undefined) return [];
  if (rest.length > 0 || first.type !== 'paragraph') return undefined;
  return first.id === undefined && first.style === undefined ? first.content : undefined;
}
