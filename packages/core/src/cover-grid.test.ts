import { describe, expect, it } from 'vitest';
import { coverColumnWidthsPt, coverGrid, fillGrid, placeAreas } from './cover.js';
import type { DocumentMeta } from './document.js';
import { validateStylesheet } from './style-validation.js';
import type { CoverGrid, PageTemplate, Stylesheet } from './stylesheet.js';
import { sheet } from './stylesheet.testing.js';

const lines = (...rows: string[]): string[][] => rows.map((row) => row.split(' '));

describe('placeAreas', () => {
  it('finds each area with its top left cell and its spans, in reading order', () => {
    const { areas, problems } = placeAreas(lines('logo number', 'side title', 'side .'), 2);
    expect(problems).toEqual([]);
    expect(areas).toEqual([
      { name: 'logo', row: 0, column: 0, rowSpan: 1, columnSpan: 1 },
      { name: 'number', row: 0, column: 1, rowSpan: 1, columnSpan: 1 },
      { name: 'side', row: 1, column: 0, rowSpan: 2, columnSpan: 1 },
      { name: 'title', row: 1, column: 1, rowSpan: 1, columnSpan: 1 },
    ]);
  });

  it('reports a line with the wrong number of names and an area that is not a rectangle', () => {
    const { areas, problems } = placeAreas(lines('a a b', 'a c', 'c c c'), 3);
    expect(problems).toEqual([
      'Row 2 has 2 names for 3 columns.',
      'The area "a" is not a rectangle.',
      'The area "c" is not a rectangle.',
    ]);
    expect(areas.map((area) => area.name)).toEqual(['b']);
  });
});

describe('coverGrid and fillGrid', () => {
  const meta: DocumentMeta = { title: 'T', fields: {} };
  const title = { kind: 'token', token: 'title', label: '' } as const;

  it('makes a cover of rows a grid of one column with an area for each row', () => {
    const grid = coverGrid({
      kind: 'rows',
      margins: { topPt: 10 },
      rows: [
        { height: { kind: 'points', pt: 90 }, valign: 'top', content: [] },
        {
          height: { kind: 'share', fr: 1 },
          valign: 'bottom',
          content: [{ kind: 'paragraph', text: [title] }],
        },
      ],
    });
    expect(grid).toEqual({
      kind: 'grid',
      margins: { topPt: 10 },
      columns: [{ kind: 'share', fr: 1 }],
      rows: [
        { kind: 'points', pt: 90 },
        { kind: 'share', fr: 1 },
      ],
      areas: [['row-1'], ['row-2']],
      area: {
        'row-1': { valign: 'top', content: [] },
        'row-2': { valign: 'bottom', content: [{ kind: 'paragraph', text: [title] }] },
      },
    });
    expect(fillGrid(grid, meta)?.map((area) => [area.name, area.items.length])).toEqual([
      ['row-1', 0],
      ['row-2', 1],
    ]);
  });

  it('fills the areas that have content, keeps the others, and is nothing when all are empty', () => {
    const grid: CoverGrid = {
      kind: 'grid',
      columns: [
        { kind: 'share', fr: 1 },
        { kind: 'points', pt: 100 },
      ],
      rows: [{ kind: 'auto' }],
      areas: lines('a b'),
      area: { b: { valign: 'center', content: [{ kind: 'paragraph', text: [title] }] } },
    };
    expect(
      fillGrid(grid, meta)?.map((area) => [area.name, area.valign, area.items.length]),
    ).toEqual([
      ['a', 'top', 0],
      ['b', 'center', 1],
    ]);
    expect(fillGrid({ ...grid, area: {} }, meta)).toBeUndefined();
  });
});

describe('coverColumnWidthsPt', () => {
  it('gives columns in points their width and shares what they leave', () => {
    expect(
      coverColumnWidthsPt(
        [
          { kind: 'points', pt: 100 },
          { kind: 'share', fr: 3 },
          { kind: 'share', fr: 1 },
        ],
        500,
      ),
    ).toEqual([100, 300, 100]);
    expect(
      coverColumnWidthsPt(
        [
          { kind: 'points', pt: 600 },
          { kind: 'share', fr: 1 },
        ],
        500,
      ),
    ).toEqual([600, 0]);
  });
});

describe('validateStylesheet and cover grids', () => {
  const page = (cover: CoverGrid): Stylesheet =>
    sheet({
      pageTemplates: {
        page: { size: 'A4', margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 }, cover },
      },
    });
  const problems = (cover: CoverGrid) =>
    validateStylesheet(page(cover)).map((d) => [d.code, d.path]);
  const ok: CoverGrid = {
    kind: 'grid',
    columns: [
      { kind: 'share', fr: 1 },
      { kind: 'points', pt: 120 },
    ],
    rows: [
      { kind: 'points', pt: 100 },
      { kind: 'share', fr: 1 },
    ],
    areas: lines('logo side', 'title side'),
    area: { side: { valign: 'top', content: [] } },
  };

  it('checks the background of an area and of a row as a color token (ADR 0093)', () => {
    expect(
      problems({
        ...ok,
        area: {
          side: { valign: 'top', background: { kind: 'token', name: 'nothing' }, content: [] },
        },
      }),
    ).toEqual([['unknown-token', 'page-templates.page.cover.area.side.background']]);
    const rows = validateStylesheet(
      sheet({
        pageTemplates: {
          page: {
            size: 'A4',
            margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
            cover: {
              kind: 'rows',
              rows: [
                {
                  height: { kind: 'points', pt: 10 },
                  valign: 'top',
                  background: { kind: 'hex', hex: '#123456' },
                  content: [],
                },
              ],
            },
          },
        },
      }),
    ).map((d) => [d.code, d.path]);
    expect(rows).toEqual([['raw-color', 'page-templates.page.cover.rows[0].background']]);
  });

  it('accepts a grid', () => {
    expect(problems(ok)).toEqual([]);
  });

  it('reports the shape of the areas, an unknown area, sizes and columns that are too wide', () => {
    expect(
      problems({
        ...ok,
        columns: [
          { kind: 'points', pt: 500 },
          { kind: 'points', pt: 0 },
          { kind: 'share', fr: 0 },
        ],
        rows: [{ kind: 'auto' }, { kind: 'share', fr: 1 }, { kind: 'points', pt: -5 }],
        areas: lines('a b c', 'b b c'),
        area: { gone: { valign: 'top', content: [] } },
      }),
    ).toEqual([
      ['invalid-value', 'page-templates.page.cover.rows[2]'],
      ['invalid-value', 'page-templates.page.cover.columns[1]'],
      ['invalid-value', 'page-templates.page.cover.columns[2]'],
      ['cover-areas-shape', 'page-templates.page.cover.areas'],
      ['cover-areas-shape', 'page-templates.page.cover.areas'],
      ['unknown-cover-area', 'page-templates.page.cover.area.gone'],
      ['cover-too-wide', 'page-templates.page.cover.columns'],
      ['cover-share-with-auto', 'page-templates.page.cover.rows'],
    ]);
  });

  it('checks the entries of an area as those of a cover', () => {
    const template: PageTemplate = {
      size: 'A4',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
      cover: {
        ...ok,
        area: {
          side: {
            valign: 'top',
            content: [{ kind: 'paragraph', style: 'gone' as never, text: [] }],
          },
        },
      },
    };
    expect(
      validateStylesheet(sheet({ pageTemplates: { page: template } })).map((d) => d.path),
    ).toEqual(['page-templates.page.cover.area.side.content[0].style']);
  });
});
