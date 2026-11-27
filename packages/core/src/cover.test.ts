import { describe, expect, it } from 'vitest';
import {
  COVER_END_RESERVE_PT,
  coverAreaHeightPt,
  coverBlocks,
  coverMargins,
  coverRowHeightsPt,
  coverGrid,
  fillCover,
  fillGrid,
  titleBlockBlocks,
} from './cover.js';
import type { DocumentMeta } from './document.js';
import { slotText, slotValue } from './slot-values.js';
import type { CoverEntry, PageTemplate, SlotPart } from './stylesheet.js';
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
type ValuePart = Exclude<SlotPart, { kind: 'text' }>;
const token = (
  name: 'title' | 'authors' | 'classification' | 'version',
  label = '',
): ValuePart => ({
  kind: 'token',
  token: name,
  label,
});
const field = (name: string, label = ''): ValuePart => ({ kind: 'field', name, label });

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
    expect(coverBlocks({ kind: 'list', entries: cover }, meta)).toEqual([
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

describe('cover rows', () => {
  const logo: CoverEntry = { kind: 'image', path: 'assets/logo.png', widthPt: 120 };
  const title: CoverEntry = {
    kind: 'paragraph',
    style: style('cover-title'),
    text: [token('title')],
  };
  const missing: CoverEntry = { kind: 'paragraph', text: [field('none')] };

  it('keeps every row of a grid, with empty ones, and leaves images in place', () => {
    const rows = fillGrid(
      coverGrid({
        kind: 'rows',
        rows: [
          { height: { kind: 'points', pt: 90 }, valign: 'top', content: [logo] },
          { height: { kind: 'share', fr: 1 }, valign: 'bottom', content: [missing, title] },
          { height: { kind: 'share', fr: 1 }, valign: 'top', content: [] },
        ],
      }),
      meta,
    );
    expect(rows?.map((row) => row.items.map((item) => item.kind))).toEqual([
      ['image'],
      ['block'],
      [],
    ]);
  });

  it('is nothing when no entry is left, and a list is one row that grows', () => {
    const empty = { height: { kind: 'auto' }, valign: 'top', content: [missing] } as const;
    expect(fillGrid(coverGrid({ kind: 'rows', rows: [empty] }), meta)).toBeUndefined();
    expect(fillCover({ kind: 'list', entries: [title] }, meta)).toEqual([
      {
        height: { kind: 'auto' },
        valign: 'top',
        items: [expect.objectContaining({ kind: 'block' })],
      },
    ]);
  });

  it('leaves images out of the blocks the editor shows', () => {
    const blocks = coverBlocks(
      { kind: 'rows', rows: [{ height: { kind: 'auto' }, valign: 'top', content: [logo, title] }] },
      meta,
    );
    expect(blocks.map((block) => block.type)).toEqual(['paragraph']);
    expect(coverBlocks(undefined, meta)).toEqual([]);
  });

  it('divides what the rows in points leave between the shares, less the reserve', () => {
    const heights = coverRowHeightsPt(
      [
        { kind: 'points', pt: 100 },
        { kind: 'share', fr: 3 },
        { kind: 'share', fr: 1 },
      ],
      502,
    );
    const left = 502 - COVER_END_RESERVE_PT - 100;
    expect(heights).toEqual([100, (left * 3) / 4, left / 4]);
    expect(coverRowHeightsPt([{ kind: 'auto' }, { kind: 'points', pt: 10 }], 500)).toEqual([
      undefined,
      10,
    ]);
    expect(
      coverRowHeightsPt(
        [
          { kind: 'points', pt: 600 },
          { kind: 'share', fr: 1 },
        ],
        500,
      ),
    ).toEqual([600, 0]);
  });

  it('takes the margins of the template for the sides the cover leaves out', () => {
    const template: PageTemplate = {
      size: 'A4',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
      cover: { kind: 'rows', margins: { topPt: 36, leftPt: 48 }, rows: [] },
    };
    expect(coverMargins(template)).toEqual({ topPt: 36, rightPt: 72, bottomPt: 72, leftPt: 48 });
    expect(coverAreaHeightPt(template)).toBeCloseTo(841.9 - 36 - 72);
    const list: PageTemplate = { ...template, cover: { kind: 'list', entries: [] } };
    expect(coverMargins(list)).toEqual(template.margins);
  });
});

describe('titleBlockBlocks', () => {
  it('fills in the metadata of a title block and leaves out images and empty entries', () => {
    const blocks = titleBlockBlocks(
      [
        { kind: 'image', path: 'assets/logo.png' },
        { kind: 'paragraph', style: style('title-main'), text: [token('title')] },
        { kind: 'paragraph', text: [field('none')] },
      ],
      meta,
    );
    expect(blocks).toEqual([
      { type: 'paragraph', style: 'title-main', content: [{ type: 'text', text: 'T', marks: [] }] },
    ]);
    expect(titleBlockBlocks(undefined, meta)).toEqual([]);
  });
});
