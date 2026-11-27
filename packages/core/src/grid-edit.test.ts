import { describe, expect, it } from 'vitest';
import {
  areaOrder,
  entriesGrid,
  gridEntries,
  gridRows,
  insertColumn,
  insertRow,
  newAreaName,
  removeColumn,
  removeRow,
  renameArea,
  setCells,
  slotsGrid,
  type GridEdit,
} from './grid-edit.js';
import type { StyleName } from './style-name.js';
import type { CoverEntry, CoverGrid } from './stylesheet.js';

const text = (value: string): CoverEntry => ({
  kind: 'paragraph',
  text: [{ kind: 'text', text: value }],
});

/** A logo beside an address, a title across both columns, and an empty row at the bottom. */
const grid: CoverGrid = {
  kind: 'grid',
  columns: [
    { kind: 'points', pt: 200 },
    { kind: 'share', fr: 1 },
  ],
  rows: [{ kind: 'points', pt: 60 }, { kind: 'share', fr: 1 }, { kind: 'auto' }],
  areas: [
    ['logo', 'address'],
    ['title', 'title'],
    ['.', '.'],
  ],
  area: {
    logo: { valign: 'top', content: [text('Logo')] },
    address: { valign: 'top', content: [text('Address')] },
    title: { valign: 'bottom', content: [text('Title')] },
  },
};

const ok = (edit: GridEdit): CoverGrid => {
  if (!edit.ok) throw new Error(edit.message);
  return edit.grid;
};

describe('grid edits (ADR 0096)', () => {
  it('lists the areas in the order in which they first appear', () => {
    expect(areaOrder(grid)).toEqual(['logo', 'address', 'title']);
  });

  it('inserts a column inside a span as part of the span, and elsewhere as empty cells', () => {
    const middle = insertColumn(grid, 1, { kind: 'points', pt: 20 });
    expect(middle.columns).toHaveLength(3);
    expect(middle.areas).toEqual([
      ['logo', '.', 'address'],
      ['title', 'title', 'title'],
      ['.', '.', '.'],
    ]);
    expect(insertColumn(grid, 2, { kind: 'share', fr: 1 }).areas[1]).toEqual([
      'title',
      'title',
      '.',
    ]);
  });

  it('inserts a row inside a span as part of it', () => {
    const tall = ok(setCells(grid, { row: 0, column: 0, rowSpan: 2, columnSpan: 1 }, 'logo'));
    // The title keeps the cell it has left, which is still a rectangle.
    expect(tall.areas[1]).toEqual(['logo', 'title']);
    const inserted = insertRow(tall, 1, { kind: 'auto' });
    expect(inserted.areas.map((line) => line[0])).toEqual(['logo', 'logo', 'logo', '.']);
    expect(inserted.areas[1]?.[1]).toBe('.');
  });

  it('removes a column with the areas that had no other cells', () => {
    const removed = ok(removeColumn(grid, 1));
    expect(removed.areas).toEqual([['logo'], ['title'], ['.']]);
    expect(Object.keys(removed.area)).toEqual(['logo', 'title']);
    expect(removeColumn(ok(removeColumn(grid, 1)), 0).ok).toBe(false);
  });

  it('removes a row, and keeps the settings of the areas that are left', () => {
    const removed = ok(removeRow(grid, 0));
    expect(removed.areas).toEqual([
      ['title', 'title'],
      ['.', '.'],
    ]);
    expect(removed.area['title']?.valign).toBe('bottom');
  });

  it('makes a new area of a rectangle of cells, taking them from the areas they were in', () => {
    const name = newAreaName(grid);
    expect(name).toBe('area-1');
    const made = ok(setCells(grid, { row: 2, column: 0, rowSpan: 1, columnSpan: 2 }, name));
    expect(made.areas[2]).toEqual(['area-1', 'area-1']);
    expect(made.area['area-1']).toEqual({ valign: 'top', content: [] });
  });

  it('adds cells to an area when together they make a rectangle, and refuses when not', () => {
    const grown = ok(setCells(grid, { row: 2, column: 0, rowSpan: 1, columnSpan: 2 }, 'title'));
    expect(grown.areas[2]).toEqual(['title', 'title']);
    const broken = setCells(grid, { row: 2, column: 0, rowSpan: 1, columnSpan: 1 }, 'title');
    expect(broken).toEqual({ ok: false, message: 'The area "title" is not a rectangle.' });
  });

  it('refuses to take cells that leave another area other than a rectangle', () => {
    const wide = insertColumn(grid, 1, { kind: 'points', pt: 20 });
    const edit = setCells(wide, { row: 1, column: 1, rowSpan: 1, columnSpan: 1 }, 'area-1');
    expect(edit).toEqual({ ok: false, message: 'The area "title" is not a rectangle.' });
  });

  it('clears cells, and removes an area that has none left', () => {
    const cleared = ok(setCells(grid, { row: 0, column: 0, rowSpan: 1, columnSpan: 1 }, '.'));
    expect(cleared.areas[0]).toEqual(['.', 'address']);
    expect(cleared.area['logo']).toBeUndefined();
  });

  it('renames an area to a free kebab-case name', () => {
    const renamed = ok(renameArea(grid, 'logo', 'mark'));
    expect(renamed.areas[0]).toEqual(['mark', 'address']);
    expect(renamed.area['mark']?.content).toEqual([text('Logo')]);
    expect(renameArea(grid, 'logo', 'title').ok).toBe(false);
    expect(renameArea(grid, 'logo', 'Logo').ok).toBe(false);
  });

  it('turns a grid of one column into rows, and refuses one with an area across rows', () => {
    const one = ok(removeColumn(grid, 1));
    expect(gridRows(one)?.map((row) => row.content)).toEqual([[text('Logo')], [text('Title')], []]);
    const tall = ok(setCells(one, { row: 0, column: 0, rowSpan: 2, columnSpan: 1 }, 'logo'));
    expect(gridRows(tall)).toBeUndefined();
    expect(gridRows(grid)).toBeUndefined();
  });

  it('gives the entries of a grid in the order of its areas, and makes a grid of entries', () => {
    expect(gridEntries(grid)).toEqual([text('Logo'), text('Address'), text('Title')]);
    expect(entriesGrid([text('A')]).area['area-1']?.content).toEqual([text('A')]);
  });

  it('makes three slots three columns, each slot in a paragraph of the style of the line', () => {
    const band = slotsGrid({
      style: 'small' as StyleName,
      left: [{ kind: 'token', token: 'title', label: '' }],
      center: [],
      right: [{ kind: 'text', text: 'Internal' }],
    });
    expect(band.areas).toEqual([['left', 'center', 'right']]);
    expect(band.rows).toEqual([{ kind: 'auto' }]);
    expect(band.area['center']?.content).toEqual([]);
    expect(band.area['right']?.content).toEqual([
      { kind: 'paragraph', style: 'small', text: [{ kind: 'text', text: 'Internal' }] },
    ]);
  });
});
