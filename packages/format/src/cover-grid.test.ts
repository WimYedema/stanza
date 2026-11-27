import { describe, expect, it } from 'vitest';
import type { CoverGrid, StyleName } from '@stanza/core';
import { coverSource } from './cover-source.js';
import { setBlock } from './edit-stylesheet.js';
import { parseStylesheet } from './stylesheet.js';

const RESERVED = [
  'body',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'code',
  'list-bulleted',
  'list-numbered',
]
  .map((style) => `  ${style}: {}`)
  .join('\n');

const sheet = (cover: string): string =>
  `stanza-format: 1\ntokens:\n  colors:\n    band: '#17607F'\nparagraph-styles:\n${RESERVED}\ntable-styles:\n  table: {}\npage-templates:\n  page:\n    size: A4\n${cover}`;

const read = (text: string) => parseStylesheet(text);
const coverOf = (text: string) =>
  read(text).stylesheet.pageTemplates.get('page' as StyleName)?.cover;
const problems = (text: string) => read(text).diagnostics.map((d) => [d.code, d.path ?? '']);

const GRID = [
  '    cover:',
  '      margins: { top: 36 }',
  '      columns: [1fr, 140]',
  '      rows: [90, 2fr, auto]',
  '      areas:',
  '        - logo  number',
  '        - title title',
  '        - .     status',
  '      area:',
  '        logo:',
  '          content:',
  '            - { image: assets/logo.png, width: 140 }',
  '        title:',
  '          valign: bottom',
  '          content:',
  "            - text: '[Untitled](stanza:title)'",
  '',
].join('\n');

const EXPECTED: CoverGrid = {
  kind: 'grid',
  margins: { topPt: 36 },
  columns: [
    { kind: 'share', fr: 1 },
    { kind: 'points', pt: 140 },
  ],
  rows: [{ kind: 'points', pt: 90 }, { kind: 'share', fr: 2 }, { kind: 'auto' }],
  areas: [
    ['logo', 'number'],
    ['title', 'title'],
    ['.', 'status'],
  ],
  area: {
    logo: { valign: 'top', content: [{ kind: 'image', path: 'assets/logo.png', widthPt: 140 }] },
    title: {
      valign: 'bottom',
      content: [
        { kind: 'paragraph', text: [{ kind: 'token', token: 'title', label: 'Untitled' }] },
      ],
    },
  },
};

describe('a cover grid in the stylesheet', () => {
  it('is read with its columns, rows, areas and the content of its areas', () => {
    const text = sheet(GRID);
    // A share beside a row that grows is an error of the grid, not of its reading.
    expect(problems(text)).toEqual([['cover-share-with-auto', 'page-templates.page.cover.rows']]);
    expect(coverOf(text)).toEqual(EXPECTED);
  });

  it('is written by coverSource so that it reads back the same, with the areas lined up', () => {
    const grid: CoverGrid = {
      ...EXPECTED,
      rows: [
        { kind: 'points', pt: 90 },
        { kind: 'share', fr: 2 },
        { kind: 'points', pt: 60 },
      ],
    };
    const source = coverSource(grid);
    expect(source.split('\n').slice(0, 8)).toEqual([
      'margins: { top: 36 }',
      'columns: [1fr, 140]',
      'rows: [90, 2fr, 60]',
      'areas:',
      "  - 'logo  number'",
      "  - 'title title'",
      "  - '.     status'",
      'area:',
    ]);
    const edited = setBlock(sheet(''), ['page-templates', 'page', 'cover'], source);
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(problems(edited.text)).toEqual([]);
      expect(coverOf(edited.text)).toEqual(grid);
    }
  });

  it('reads and writes the background of a row and of an area (ADR 0093)', () => {
    const rows = sheet(
      ['    cover:', '      rows:', '        - height: 20', '          background: band', ''].join(
        '\n',
      ),
    );
    const cover = coverOf(rows);
    expect(cover).toEqual({
      kind: 'rows',
      rows: [
        {
          height: { kind: 'points', pt: 20 },
          valign: 'top',
          background: { kind: 'token', name: 'band' },
          content: [],
        },
      ],
    });
    if (cover === undefined) return;
    expect(coverSource(cover)).toBe('rows:\n  - height: 20\n    background: band');
    const grid: CoverGrid = {
      ...EXPECTED,
      rows: [
        { kind: 'points', pt: 90 },
        { kind: 'share', fr: 2 },
        { kind: 'points', pt: 60 },
      ],
      area: { logo: { valign: 'top', background: { kind: 'token', name: 'band' }, content: [] } },
    };
    const edited = setBlock(sheet(''), ['page-templates', 'page', 'cover'], coverSource(grid));
    expect(edited.ok && coverOf(edited.text)).toEqual(grid);
  });

  it('takes one column of the whole width when it gives no columns', () => {
    const text = sheet(
      ['    cover:', '      rows: [100]', '      areas:', '        - only', ''].join('\n'),
    );
    expect(coverOf(text)).toMatchObject({ columns: [{ kind: 'share', fr: 1 }], areas: [['only']] });
  });

  it('reports what is wrongly written', () => {
    expect(
      problems(
        sheet(
          [
            '    cover:',
            '      columns: [1fr, auto]',
            '      rows: [tall]',
            '      areas:',
            '        - One two',
            '        - 5',
            '      area:',
            '        one: { size: 3 }',
            '',
          ].join('\n'),
        ),
      ).slice(0, 5),
    ).toEqual([
      ['invalid-value', 'page-templates.page.cover.columns[1]'],
      ['invalid-value', 'page-templates.page.cover.rows[0]'],
      ['invalid-value', 'page-templates.page.cover.areas[0]'],
      ['invalid-type', 'page-templates.page.cover.areas[1]'],
      ['unknown-property', 'page-templates.page.cover.area.one.size'],
    ]);
    expect(
      problems(sheet(['    cover:', '      columns: [1fr]', '      rows: []', ''].join('\n'))),
    ).toEqual([['unknown-property', 'page-templates.page.cover.columns']]);
  });
});
