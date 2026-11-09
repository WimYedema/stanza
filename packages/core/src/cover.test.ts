import { describe, expect, it } from 'vitest';
import { coverBlocks } from './cover.js';
import type { DocumentMeta } from './document.js';
import { slotText, slotValue } from './slot-values.js';
import type { CoverEntry, SlotPart } from './stylesheet.js';
import { isStyleName, type StyleName } from './style-name.js';
import { plainCell } from './table-cell.js';

const style = (value: string): StyleName => {
  if (!isStyleName(value)) throw new Error(value);
  return value;
};

const meta: DocumentMeta = {
  title: 'T',
  authors: ['A', 'B'],
  fields: { 'document-number': 'EX-1', reviewers: ['R', 'S'] },
};

const text = (value: string): SlotPart => ({ kind: 'text', text: value });
const token = (name: 'title' | 'authors' | 'classification' | 'version', label = ''): SlotPart => ({
  kind: 'token',
  token: name,
  label,
});
const field = (name: string, label = ''): SlotPart => ({ kind: 'field', name, label });

describe('slotValue and slotText', () => {
  it('give the value of a token or field, and the label when there is none', () => {
    expect(slotValue(token('title'), meta)).toBe('T');
    expect(slotValue(token('authors'), meta)).toBe('A, B');
    expect(slotValue(token('classification'), meta)).toBeUndefined();
    expect(slotValue(token('version'), meta)).toBeUndefined();
    expect(slotValue(field('reviewers'), meta)).toBe('R, S');
    expect(slotText([text('By '), token('authors'), text(' '), token('version', 'v?')], meta)).toBe(
      'By A, B v?',
    );
  });
});

describe('coverBlocks', () => {
  const cover: readonly CoverEntry[] = [
    { kind: 'paragraph', style: style('cover-title'), text: [token('title', 'Untitled')] },
    { kind: 'paragraph', text: [token('classification')] },
    {
      kind: 'table',
      style: style('table'),
      rows: [
        { label: 'Number', value: [field('document-number')] },
        { label: 'Class', value: [token('classification')] },
      ],
    },
    { kind: 'table', style: style('table'), rows: [{ label: 'None', value: [field('none')] }] },
  ];

  it('fills in the metadata, and leaves out empty paragraphs, rows and tables', () => {
    expect(coverBlocks(cover, meta)).toEqual([
      {
        type: 'paragraph',
        style: 'cover-title',
        content: [{ type: 'text', text: 'T', marks: [] }],
      },
      {
        type: 'table',
        style: 'table',
        header: [],
        rows: [
          [
            plainCell([{ type: 'text', text: 'Number', marks: [] }]),
            plainCell([{ type: 'text', text: 'EX-1', marks: [] }]),
          ],
        ],
      },
    ]);
  });
});
