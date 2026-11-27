// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoverGrid, PageTemplate, StyleName, Stylesheet } from '@stanza/core';
import { parseStylesheet, setBlock } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { attachOverlay, joinable, rangeOf } from './styles-grid-overlay.js';
import { createBandGridEditor, parseWidth } from './styles-grid.js';

const BASE = `stanza-format: 1
paragraph-styles:
  body: {}
  heading-1: {}
  heading-2: {}
  heading-3: {}
  heading-4: {}
  heading-5: {}
  heading-6: {}
  code: {}
  list-bulleted: {}
  list-numbered: {}
  small: {}
table-styles:
  table: {}
page-templates:
  page:
    size: A4
    header:
      style: small
      distance: 28
      left: '[](stanza:title)'
      right: '[1](stanza:page)'
`;

const grid: CoverGrid = {
  kind: 'grid',
  columns: [
    { kind: 'share', fr: 1 },
    { kind: 'share', fr: 1 },
  ],
  rows: [{ kind: 'auto' }, { kind: 'auto' }],
  areas: [
    ['logo', '.'],
    ['.', '.'],
  ],
  area: { logo: { valign: 'top', content: [] } },
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('parseWidth', () => {
  it('reads points and shares, and refuses a column that grows', () => {
    expect(parseWidth('225')).toEqual({ kind: 'points', pt: 225 });
    expect(parseWidth('2fr')).toEqual({ kind: 'share', fr: 2 });
    expect(parseWidth('')).toBeUndefined();
    expect(parseWidth('0')).toBeUndefined();
  });
});

describe('the header and footer grid (ADR 0096)', () => {
  it('makes the slots a grid, keeps the style and distance, and makes slots again', () => {
    let text = BASE;
    const sent: StylesWebviewMessage[] = [];
    const editor = createBandGridEditor('header', {
      send: (message) => sent.push(message),
      images: () => [],
      listId: 'images',
      refuse: () => undefined,
      selected: () => undefined,
    });
    const show = (): Stylesheet => {
      const stylesheet = parseStylesheet(text).stylesheet;
      const template = stylesheet.pageTemplates.get('page' as StyleName) as PageTemplate;
      editor.update('page', template, stylesheet);
      return stylesheet;
    };
    const apply = (): PageTemplate => {
      const message = sent.at(-1);
      if (message?.type !== 'set-block') throw new Error('Nothing was sent.');
      const result = setBlock(text, message.path, message.source ?? undefined);
      if (!result.ok) throw new Error(result.message);
      text = result.text;
      return show().pageTemplates.get('page' as StyleName) as PageTemplate;
    };
    show();
    expect(editor.element.hidden).toBe(true);
    editor.setKind('grid');
    let header = apply().header;
    expect(header?.style).toBe('small');
    expect(header?.distancePt).toBe(28);
    expect(header?.grid?.areas).toEqual([['left', 'center', 'right']]);
    expect(header?.grid?.area['right']?.content).toEqual([
      { kind: 'paragraph', style: 'small', text: [{ kind: 'token', token: 'page', label: '1' }] },
    ]);
    expect(editor.element.hidden).toBe(false);
    expect(editor.element.querySelectorAll('.grid-area')).toHaveLength(3);
    // The page fields can be inserted in a header.
    const insert = [...editor.element.querySelectorAll('select')].find(
      (select) => select.title === 'Insert a value that the program fills in',
    );
    expect([...(insert?.options ?? [])].map((option) => option.value)).toContain('page');
    editor.cells({ row: 0, column: 1, rowSpan: 1, columnSpan: 2 }, { kind: 'add', name: 'right' });
    header = apply().header;
    expect(header?.grid?.areas).toEqual([['left', 'right', 'right']]);
    editor.setKind('slots');
    header = apply().header;
    expect(header?.grid).toBeUndefined();
    expect(header?.style).toBe('small');
    expect(header?.left).toEqual([]);
  });
});

describe('the grid over the preview', () => {
  const draw = () => {
    const layout = document.createElement('div');
    const bar = document.createElement('div');
    bar.hidden = true;
    document.body.append(layout, bar);
    const cells = vi.fn();
    const select = vi.fn();
    attachOverlay(layout, grid, 'logo', bar, { cells, select });
    const cell = (row: number, column: number): HTMLElement => {
      const found = layout.querySelector<HTMLElement>(
        `.grid-cell[data-row="${String(row)}"][data-column="${String(column)}"]`,
      );
      if (found === null) throw new Error('No cell.');
      return found;
    };
    return { layout, bar, cells, select, cell };
  };

  it('draws a cell for each place, and a frame with the name of each area', () => {
    const { layout } = draw();
    expect(layout.querySelectorAll('.grid-cell')).toHaveLength(4);
    expect(layout.querySelector('.grid-frame.selected .grid-label')?.textContent).toBe('logo');
  });

  it('selects the cells of a drag, and offers a new area, the areas they join, and clearing', () => {
    const { bar, cells, cell } = draw();
    cell(0, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cell(1, 1).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(cell(1, 1).classList.contains('picked')).toBe(true);
    expect(cell(0, 0).classList.contains('picked')).toBe(false);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toContain('1 × 2 cells:');
    const labels = [...bar.querySelectorAll('button')].map((button) => button.textContent);
    // Empty cells beside the logo but two rows high do not make a rectangle with it.
    expect(labels).toEqual(['New area', 'Cancel']);
    bar.querySelector('button')?.click();
    expect(cells).toHaveBeenCalledWith(
      { row: 0, column: 1, rowSpan: 2, columnSpan: 1 },
      {
        kind: 'new',
      },
    );
    expect(bar.hidden).toBe(true);
  });

  it('selects the area of a cell that is clicked', () => {
    const { select, cell, bar } = draw();
    cell(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(select).toHaveBeenCalledWith('logo');
    expect([...bar.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Clear',
    );
  });

  it('knows which areas cells can join', () => {
    expect(joinable(grid, rangeOf({ row: 0, column: 1 }, { row: 0, column: 1 }))).toEqual(['logo']);
    expect(joinable(grid, rangeOf({ row: 0, column: 0 }, { row: 0, column: 0 }))).toEqual([]);
  });
});
