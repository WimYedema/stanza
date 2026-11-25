import { describe, expect, it } from 'vitest';
import { isReservedStyle, styleReferences } from './style-references.js';
import { BUILT_IN_PAGE_TEMPLATE } from './stylesheet.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';

describe('isReservedStyle', () => {
  it('knows the reserved paragraph styles and the reserved table style', () => {
    expect(isReservedStyle('paragraph', n('body'))).toBe(true);
    expect(isReservedStyle('paragraph', n('heading-3'))).toBe(true);
    expect(isReservedStyle('paragraph', n('note'))).toBe(false);
    expect(isReservedStyle('table', n('table'))).toBe(true);
    expect(isReservedStyle('table', n('table-grid'))).toBe(false);
    expect(isReservedStyle('character', n('body'))).toBe(false);
  });
});

describe('styleReferences', () => {
  const stylesheet = sheet({
    paragraph: {
      note: plainStyle,
      'warning-note': { ...plainStyle, basedOn: n('note') },
      'header-footer': plainStyle,
      'cover-title': plainStyle,
    },
    character: {
      status: { text: {} },
      'status-high': { text: {}, basedOn: n('status') },
    },
    table: {
      'table-grid': { basedOn: n('table'), cellStyle: n('note') },
      'cover-table': {},
    },
    pageTemplates: {
      page: {
        ...BUILT_IN_PAGE_TEMPLATE,
        header: { style: n('header-footer'), left: [], center: [], right: [] },
        footer: { style: n('header-footer'), left: [], center: [], right: [] },
        cover: {
          kind: 'list',
          entries: [
            { kind: 'paragraph', style: n('cover-title'), text: [] },
            { kind: 'table', style: n('cover-table'), rows: [] },
          ],
        },
      },
    },
  });

  it('names a style that is based on a paragraph style, and a table style that uses it for cells', () => {
    expect(styleReferences(stylesheet, 'paragraph', n('note'))).toEqual([
      'The paragraph style "warning-note" is based on it.',
      'The table style "table-grid" has it as its cell style.',
    ]);
  });

  it('names a page template that uses a style in its header, footer or cover', () => {
    expect(styleReferences(stylesheet, 'paragraph', n('header-footer'))).toEqual([
      'The page template "page" uses it in its header.',
      'The page template "page" uses it in its footer.',
    ]);
    expect(styleReferences(stylesheet, 'paragraph', n('cover-title'))).toEqual([
      'The page template "page" uses it in its cover.',
    ]);
    expect(styleReferences(stylesheet, 'table', n('cover-table'))).toEqual([
      'The page template "page" uses it in its cover.',
    ]);
  });

  it('keeps the families apart, since a character and a paragraph style can share a name', () => {
    expect(styleReferences(stylesheet, 'character', n('status'))).toEqual([
      'The character style "status-high" is based on it.',
    ]);
    expect(styleReferences(stylesheet, 'paragraph', n('status'))).toEqual([]);
    expect(styleReferences(stylesheet, 'table', n('table'))).toEqual([
      'The table style "table-grid" is based on it.',
    ]);
  });

  it('finds nothing for a style that nothing refers to', () => {
    expect(styleReferences(stylesheet, 'character', n('status-high'))).toEqual([]);
    expect(styleReferences(stylesheet, 'paragraph', n('warning-note'))).toEqual([]);
  });
});
