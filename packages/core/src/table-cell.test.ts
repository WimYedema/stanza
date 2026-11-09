import { describe, expect, it } from 'vitest';
import type { Inline, TableCell } from './document.js';
import { plainCell, plainCellInlines } from './table-cell.js';

const text = (value: string): Inline => ({ type: 'text', text: value, marks: [] });

describe('plainCell', () => {
  it('makes one paragraph of a text, and no block of no text', () => {
    expect(plainCell([text('a')])).toEqual({
      blocks: [{ type: 'paragraph', content: [text('a')] }],
    });
    expect(plainCell([])).toEqual({ blocks: [] });
  });
});

describe('plainCellInlines', () => {
  it('gives the text of an empty cell and of a cell with one paragraph', () => {
    expect(plainCellInlines({ blocks: [] })).toEqual([]);
    expect(plainCellInlines(plainCell([text('a')]))).toEqual([text('a')]);
  });

  it('gives nothing for a cell that a pipe table cannot write', () => {
    const paragraph = { type: 'paragraph', content: [text('a')] } as const;
    const list = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph] }],
    } as const;
    const cells: TableCell[] = [
      { blocks: [paragraph, paragraph] },
      { blocks: [list] },
      { blocks: [{ ...paragraph, style: 'note' as never }] },
    ];
    for (const cell of cells) expect(plainCellInlines(cell)).toBeUndefined();
  });
});
