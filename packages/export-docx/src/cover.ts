import type { Block, CoverEntry, DocumentMeta, TableCell, Text } from '@phrase/core';
import { slotText } from './slot-values.js';

const text = (value: string): Text => ({ type: 'text', text: value, marks: [] });
const cell = (value: string): TableCell => ({ content: [text(value)] });

/**
 * The blocks of a cover page, with the metadata filled in. A paragraph without text and a row
 * without a value are left out, and so is a table without rows. A cover table has no header row.
 */
export function coverBlocks(cover: readonly CoverEntry[], meta: DocumentMeta): Block[] {
  return cover.flatMap((entry): Block[] => {
    if (entry.kind === 'paragraph') {
      const content = slotText(entry.text, meta);
      if (content === '') return [];
      return [
        {
          type: 'paragraph',
          ...(entry.style !== undefined ? { style: entry.style } : {}),
          content: [text(content)],
        },
      ];
    }
    const rows = entry.rows.flatMap((row) => {
      const value = slotText(row.value, meta);
      return value === '' ? [] : [[cell(row.label), cell(value)]];
    });
    return rows.length === 0 ? [] : [{ type: 'table', style: entry.style, header: [], rows }];
  });
}
