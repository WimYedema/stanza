import { describe, expect, it } from 'vitest';
import { PARAGRAPH_PROPERTIES, TEXT_PROPERTIES, type StyleName } from '@phrase/core';
import { parseStylesheet } from '@phrase/format';
import {
  borderText,
  fontFrom,
  lineSpacingText,
  numberFrom,
  stateBy,
  stateOf,
  titleOf,
  valueText,
  variantStateOf,
} from './styles-properties.js';

const stylesheet = parseStylesheet(`phrase-format: 1
tokens:
  colors:
    brand: '#2E75B6'
  fonts:
    body: ['Calibri', 'Arial']
paragraph-styles:
  body:
    font: body
    size: 11
    space-after: 6
    variants:
      strong: { bold: true }
      emphasis: false
  heading-1:
    based-on: body
    size: 18
    variants:
      strong: false
  heading-2:
    based-on: heading-1
character-styles:
  muted:
    color: brand
    bold: true
  quiet:
    based-on: muted
    bold: false
table-styles:
  table:
    cell-padding: 4
    border:
      outer: { width: 1, color: brand }
    header-row:
      bold: true
  table-grid:
    based-on: table
    border:
      inside-vertical: { width: 0.5, color: brand }
    header-row:
      repeat: true
`).stylesheet;

const name = (value: string): StyleName => value as StyleName;
const paragraphs = stylesheet.paragraphStyles;
const type = (key: string) => {
  const found = [...TEXT_PROPERTIES, ...PARAGRAPH_PROPERTIES].find((p) => p.key === key);
  if (found === undefined) throw new Error(`No property ${key}.`);
  return found.type;
};

describe('stateOf', () => {
  it('has what the style sets and what the base gives next to it', () => {
    expect(stateOf(paragraphs, name('heading-1'), 'text', 'sizePt')).toEqual({
      own: 18,
      inherited: { value: 11, from: 'body' },
    });
  });

  it('has no base for a property of a style that has none', () => {
    expect(stateOf(paragraphs, name('body'), 'text', 'sizePt')).toEqual({
      own: 11,
      inherited: undefined,
    });
  });

  it('names the base the value comes from, past bases that do not set it', () => {
    const state = stateOf(paragraphs, name('heading-2'), 'paragraph', 'spaceAfterPt');
    expect(state.own).toBeUndefined();
    expect(state.inherited).toEqual({ value: 6, from: 'body' });
  });

  it('has the value of the style and, next to it, nothing from a base that does not set it', () => {
    const state = stateOf(paragraphs, name('heading-1'), 'text', 'bold');
    expect(state.own).toBeUndefined();
    const sized = stateOf(paragraphs, name('body'), 'text', 'sizePt');
    expect(sized.own).toBe(11);
  });

  it('has nothing for a property no style sets', () => {
    expect(stateOf(paragraphs, name('heading-2'), 'text', 'bold')).toEqual({
      own: undefined,
      inherited: undefined,
    });
  });
});

describe('stateOf for character styles', () => {
  const characters = stylesheet.characterStyles;

  it('follows the bases of character styles', () => {
    expect(stateOf(characters, name('quiet'), 'text', 'color')).toEqual({
      own: undefined,
      inherited: { value: { kind: 'token', name: 'brand' }, from: 'muted' },
    });
    expect(stateOf(characters, name('quiet'), 'text', 'bold')).toEqual({
      own: false,
      inherited: { value: true, from: 'muted' },
    });
  });

  it('has no paragraph properties', () => {
    expect(stateOf(characters, name('muted'), 'paragraph', 'spaceAfterPt')).toEqual({
      own: undefined,
      inherited: undefined,
    });
  });
});

describe('stateBy for table styles', () => {
  const tables = stylesheet.tableStyles;

  it('takes a border from the base as a whole', () => {
    const state = stateBy(tables, name('table-grid'), (style) => style.border?.outer);
    expect(state.own).toBeUndefined();
    expect(state.inherited).toEqual({
      value: { widthPt: 1, color: { kind: 'token', name: 'brand' } },
      from: 'table',
    });
  });

  it('reads the properties of a header row one by one', () => {
    expect(stateBy(tables, name('table-grid'), (style) => style.headerRow?.repeat).own).toBe(true);
    expect(stateBy(tables, name('table-grid'), (style) => style.headerRow?.text.bold)).toEqual({
      own: undefined,
      inherited: { value: true, from: 'table' },
    });
  });
});

describe('borderText', () => {
  it('writes the width and the color', () => {
    expect(borderText({ widthPt: 0.75, color: { kind: 'hex', hex: '#BFBFBF' } })).toBe(
      '0.75 pt #BFBFBF',
    );
  });
});

describe('variantStateOf', () => {
  it('has the variant of the style itself and the nearest base that declares one', () => {
    const state = variantStateOf(stylesheet, name('heading-1'), 'strong');
    expect(state.own).toBe(null);
    expect(state.inherited).toEqual({ value: { bold: true }, from: 'body' });
  });

  it('takes the nearest base for a style that declares none', () => {
    const state = variantStateOf(stylesheet, name('heading-2'), 'strong');
    expect(state.own).toBeUndefined();
    expect(state.inherited).toEqual({ value: null, from: 'heading-1' });
  });

  it('has nothing when no style declares it', () => {
    expect(variantStateOf(stylesheet, name('heading-2'), 'code')).toEqual({
      own: undefined,
      inherited: undefined,
    });
  });
});

describe('valueText', () => {
  it('writes a number with its unit', () => {
    expect(valueText(type('size'), 11)).toBe('11 pt');
  });

  it('writes flags as yes and no', () => {
    expect(valueText(type('bold'), true)).toBe('yes');
    expect(valueText(type('bold'), false)).toBe('no');
  });

  it('writes a line spacing in words', () => {
    expect(lineSpacingText({ rule: 'multiple', factor: 1.5 })).toBe('1.5 lines');
    expect(lineSpacingText({ rule: 'at-least', pt: 14 })).toBe('at least 14 pt');
    expect(lineSpacingText({ rule: 'exactly', pt: 14 })).toBe('exactly 14 pt');
  });

  it('writes a color and a font as typed', () => {
    expect(valueText(type('color'), { kind: 'token', name: 'brand' })).toBe('brand');
    expect(valueText(type('color'), { kind: 'hex', hex: '#112233' })).toBe('#112233');
    expect(valueText(type('font'), { kind: 'families', families: ['A', 'B'] })).toBe('A, B');
  });
});

describe('titleOf', () => {
  it('makes words of a key', () => {
    expect(titleOf('space-before')).toBe('Space before');
    expect(titleOf('bold')).toBe('Bold');
  });
});

describe('numberFrom', () => {
  it('reads a number, nothing, and what is not a number', () => {
    expect(numberFrom(' 12.5 ')).toBe(12.5);
    expect(numberFrom('  ')).toBeNull();
    expect(numberFrom('abc')).toBeUndefined();
    expect(numberFrom('Infinity')).toBeUndefined();
  });
});

describe('fontFrom', () => {
  it('reads the name of a token, families, and nothing', () => {
    expect(fontFrom('body')).toBe('body');
    expect(fontFrom('Times New Roman, serif')).toEqual(['Times New Roman', 'serif']);
    expect(fontFrom(' ')).toBeNull();
    expect(fontFrom(' , ')).toBeNull();
  });
});
