import { describe, expect, it } from 'vitest';
import type { Mark } from './document.js';
import {
  markAllowed,
  resolveCharacterStyle,
  resolveParagraphStyle,
  resolveTableStyle,
  resolveTextProps,
} from './style-resolution.js';
import { validateStylesheet } from './style-validation.js';
import { RESERVED_TABLE_STYLE, type Stylesheet } from './stylesheet.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';

const hex = (value: string) => ({ kind: 'hex', hex: value }) as const;
const token = (name: string) => ({ kind: 'token', name }) as const;
const strong: Mark = { type: 'strong' };
const emphasis: Mark = { type: 'emphasis' };
const code: Mark = { type: 'code' };
const marker: Mark = { type: 'style', name: n('marker') };

describe('resolveParagraphStyle', () => {
  it('lets a style override the properties of its base', () => {
    const stylesheet = sheet({
      paragraph: {
        body: {
          text: { sizePt: 10, bold: false },
          paragraph: { spaceAfterPt: 6, keepWithNext: true },
          variants: {},
        },
        'heading-1': {
          basedOn: n('body'),
          text: { sizePt: 16, bold: true },
          paragraph: { spaceBeforePt: 24 },
          variants: {},
        },
      },
    });
    expect(resolveParagraphStyle(stylesheet, n('heading-1'))).toEqual({
      name: 'heading-1',
      text: { sizePt: 16, bold: true },
      paragraph: { spaceAfterPt: 6, keepWithNext: true, spaceBeforePt: 24 },
      variants: {},
    });
  });

  it('inherits variants per mark and merges their properties', () => {
    const stylesheet = sheet({
      paragraph: {
        body: {
          ...plainStyle,
          variants: { strong: { bold: true }, emphasis: { italic: true } },
        },
        'heading-1': {
          ...plainStyle,
          basedOn: n('body'),
          variants: { strong: { color: hex('#112233') } },
        },
      },
    });
    expect(resolveParagraphStyle(stylesheet, n('heading-1'))?.variants).toEqual({
      strong: { bold: true, color: hex('#112233') },
      emphasis: { italic: true },
    });
  });

  it('lets a style switch off an inherited variant', () => {
    const stylesheet = sheet({
      paragraph: {
        body: { ...plainStyle, variants: { strong: { bold: true }, code: {} } },
        'heading-1': { ...plainStyle, basedOn: n('body'), variants: { strong: null } },
      },
    });
    expect(resolveParagraphStyle(stylesheet, n('heading-1'))?.variants).toEqual({ code: {} });
    expect(markAllowed(stylesheet, n('heading-1'), 'strong')).toBe(false);
    expect(markAllowed(stylesheet, n('heading-1'), 'code')).toBe(true);
    expect(markAllowed(stylesheet, n('body'), 'strong')).toBe(true);
  });

  it('allows a mark with an empty variant', () => {
    const stylesheet = sheet({
      paragraph: { body: { ...plainStyle, variants: { emphasis: {} } } },
    });
    expect(markAllowed(stylesheet, n('body'), 'emphasis')).toBe(true);
    expect(markAllowed(stylesheet, n('body'), 'strong')).toBe(false);
  });

  it('returns undefined for an unknown style, an unknown base, and a cycle', () => {
    const stylesheet = sheet({
      paragraph: {
        a: { ...plainStyle, basedOn: n('b') },
        b: { ...plainStyle, basedOn: n('a') },
        c: { ...plainStyle, basedOn: n('missing') },
      },
    });
    expect(resolveParagraphStyle(stylesheet, n('nope'))).toBeUndefined();
    expect(resolveParagraphStyle(stylesheet, n('a'))).toBeUndefined();
    expect(resolveParagraphStyle(stylesheet, n('c'))).toBeUndefined();
    expect(markAllowed(stylesheet, n('a'), 'strong')).toBe(false);
  });
});

describe('resolveCharacterStyle', () => {
  it('applies the base style first', () => {
    const stylesheet = sheet({
      character: {
        marker: { text: { bold: true, color: hex('#3F98BD') } },
        'loud-marker': { basedOn: n('marker'), text: { sizePt: 12, bold: false } },
      },
    });
    expect(resolveCharacterStyle(stylesheet, n('loud-marker'))).toEqual({
      bold: false,
      color: hex('#3F98BD'),
      sizePt: 12,
    });
    expect(resolveCharacterStyle(stylesheet, n('unknown'))).toBeUndefined();
  });
});

describe('resolveTableStyle', () => {
  const line = (widthPt: number) => ({ widthPt, color: hex('#999999') });

  it('merges borders side by side and header rows property by property', () => {
    const stylesheet = sheet({
      table: {
        table: {
          border: { outer: line(1), insideHorizontal: line(0.5) },
          headerRow: { text: { bold: true }, background: hex('#EEEEEE'), repeat: true },
          cellPaddingPt: 4,
        },
        'table-plain': {
          basedOn: n('table'),
          border: { outer: line(2) },
          headerRow: { text: { italic: true }, repeat: false },
          cellPaddingPt: 2,
        },
      },
    });
    expect(resolveTableStyle(stylesheet, n('table-plain'))).toEqual({
      name: 'table-plain',
      border: { outer: line(2), insideHorizontal: line(0.5) },
      headerRow: {
        text: { bold: true, italic: true },
        background: hex('#EEEEEE'),
        repeat: false,
      },
      cellPaddingPt: 2,
    });
  });

  it('returns only what is defined', () => {
    expect(resolveTableStyle(sheet(), RESERVED_TABLE_STYLE)).toEqual({ name: 'table' });
  });

  it('merges the odd and even backgrounds of banded rows one by one', () => {
    const stylesheet = sheet({
      table: {
        table: { bandedRows: { odd: hex('#F2F2F2'), even: hex('#FFFFFF') } },
        'table-b': { basedOn: n('table'), bandedRows: { even: hex('#EEEEEE') } },
      },
    });
    expect(resolveTableStyle(stylesheet, n('table-b'))?.bandedRows).toEqual({
      odd: hex('#F2F2F2'),
      even: hex('#EEEEEE'),
    });
  });

  it('inherits the cell style and lets a style replace it', () => {
    const stylesheet = sheet({
      paragraph: { cell: plainStyle },
      table: {
        table: { cellStyle: n('cell') },
        'table-b': { basedOn: n('table') },
        'table-c': { basedOn: n('table'), cellStyle: n('body') },
      },
    });
    expect(resolveTableStyle(stylesheet, n('table-b'))?.cellStyle).toBe('cell');
    expect(resolveTableStyle(stylesheet, n('table-c'))?.cellStyle).toBe('body');
  });
});

describe('resolveTextProps', () => {
  const stylesheet = sheet({
    paragraph: {
      body: {
        text: { sizePt: 10, color: hex('#000000') },
        paragraph: {},
        variants: {
          strong: { bold: true },
          emphasis: { italic: true },
          code: { color: hex('#AA0000') },
        },
      },
      'heading-1': { ...plainStyle, basedOn: n('body'), variants: { strong: null } },
    },
    character: { marker: { text: { color: hex('#3F98BD'), bold: true } } },
  });

  it('applies the paragraph style, then variants, then character styles', () => {
    expect(resolveTextProps(stylesheet, n('body'), [])).toEqual({
      sizePt: 10,
      color: hex('#000000'),
    });
    expect(resolveTextProps(stylesheet, n('body'), [strong, emphasis])).toEqual({
      sizePt: 10,
      color: hex('#000000'),
      bold: true,
      italic: true,
    });
    // The character style comes last, so its color beats the code variant's.
    expect(resolveTextProps(stylesheet, n('body'), [marker, code])).toEqual({
      sizePt: 10,
      color: hex('#3F98BD'),
      bold: true,
    });
  });

  it('ignores a mark the style does not allow', () => {
    expect(resolveTextProps(stylesheet, n('heading-1'), [strong, emphasis])).toEqual({
      sizePt: 10,
      color: hex('#000000'),
      italic: true,
    });
  });

  it('returns undefined for an unknown paragraph style', () => {
    expect(resolveTextProps(stylesheet, n('unknown'), [])).toBeUndefined();
  });

  it('puts the base of a container between the paragraph style and the variants', () => {
    expect(
      resolveTextProps(stylesheet, n('body'), [strong], { color: hex('#112233'), italic: true }),
    ).toEqual({ sizePt: 10, color: hex('#112233'), italic: true, bold: true });
  });
});

describe('validateStylesheet', () => {
  const problems = (stylesheet: Stylesheet) =>
    validateStylesheet(stylesheet).map((d) => [d.code, d.path]);

  it('accepts a stylesheet with the reserved styles', () => {
    expect(validateStylesheet(sheet())).toEqual([]);
  });

  it('reports a cell style that is not a paragraph style', () => {
    const stylesheet = sheet({ table: { table: { cellStyle: n('gone') } } });
    expect(problems(stylesheet)).toEqual([['unknown-cell-style', 'table-styles.table.cell-style']]);
  });

  it('warns about header properties that the cell style also sets', () => {
    const stylesheet = sheet({
      paragraph: { body: { ...plainStyle, text: { sizePt: 10 } } },
      table: { table: { headerRow: { text: { bold: true, sizePt: 12 } } } },
    });
    expect(validateStylesheet(stylesheet)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'header-property-overridden',
        path: 'table-styles.table.header-row.size',
      }),
    ]);
  });

  it('requires the reserved styles', () => {
    const stylesheet = sheet({ paragraph: { body: undefined, 'heading-3': undefined } });
    expect(problems(stylesheet)).toEqual([
      ['missing-reserved-style', 'paragraph-styles.body'],
      ['missing-reserved-style', 'paragraph-styles.heading-3'],
    ]);
    const noTable: Stylesheet = { ...sheet(), tableStyles: new Map() };
    expect(problems(noTable)).toEqual([['missing-reserved-style', 'table-styles.table']]);
  });

  it('reports unknown bases and cycles in every kind of style', () => {
    const stylesheet = sheet({
      paragraph: {
        a: { ...plainStyle, basedOn: n('b') },
        b: { ...plainStyle, basedOn: n('a') },
        c: { ...plainStyle, basedOn: n('gone') },
      },
      character: { x: { basedOn: n('x'), text: {} } },
      table: { t: { basedOn: n('gone-table') } },
    });
    expect(problems(stylesheet)).toEqual([
      ['style-cycle', 'paragraph-styles.a.based-on'],
      ['style-cycle', 'paragraph-styles.b.based-on'],
      ['unknown-base-style', 'paragraph-styles.c.based-on'],
      ['style-cycle', 'character-styles.x.based-on'],
      ['unknown-base-style', 'table-styles.t.based-on'],
    ]);
  });

  it('reports unknown tokens wherever a color or font is used', () => {
    const stylesheet = sheet({
      paragraph: {
        body: {
          text: { font: token('nope'), color: token('nope') },
          paragraph: { background: token('nope') },
          variants: { link: { color: token('nope') } },
        },
      },
      character: { marker: { text: { highlight: token('nope') } } },
      table: {
        table: {
          border: { outer: { widthPt: 1, color: token('nope') } },
          headerRow: { text: {}, background: token('nope') },
          bandedRows: { odd: token('nope'), even: token('nope') },
        },
      },
    });
    expect(problems(stylesheet)).toEqual([
      ['unknown-token', 'paragraph-styles.body.font'],
      ['unknown-token', 'paragraph-styles.body.color'],
      ['unknown-token', 'paragraph-styles.body.background'],
      ['unknown-token', 'paragraph-styles.body.variants.link.color'],
      ['unknown-token', 'character-styles.marker.highlight'],
      ['unknown-token', 'table-styles.table.border.outer.color'],
      ['unknown-token', 'table-styles.table.header-row.background'],
      ['unknown-token', 'table-styles.table.banded-rows.odd'],
      ['unknown-token', 'table-styles.table.banded-rows.even'],
    ]);
  });

  it('accepts tokens that exist', () => {
    const stylesheet = sheet({
      colors: { brand: '#3F98BD' },
      fonts: { body: ['Arial'] },
      paragraph: {
        body: {
          text: { font: token('body'), color: token('brand') },
          paragraph: {},
          variants: {},
        },
      },
    });
    expect(validateStylesheet(stylesheet)).toEqual([]);
  });

  it('reports invalid values', () => {
    const stylesheet = sheet({
      colors: { bad: 'red' },
      fonts: { empty: [] },
      paragraph: {
        body: {
          text: { sizePt: 0, color: hex('#abc') },
          paragraph: {
            spaceBeforePt: -1,
            indentLeftPt: -2,
            firstLineIndentPt: Number.NaN,
            lineSpacing: { rule: 'multiple', factor: 0 },
          },
          variants: { strong: { sizePt: -3 } },
        },
      },
      table: {
        table: {
          border: { insideVertical: { widthPt: 0, color: hex('#000000') } },
          cellPaddingPt: -1,
        },
      },
    });
    expect(problems(stylesheet)).toEqual([
      ['invalid-value', 'tokens.colors.bad'],
      ['invalid-value', 'tokens.fonts.empty'],
      ['invalid-value', 'paragraph-styles.body.size'],
      ['invalid-value', 'paragraph-styles.body.color'],
      ['invalid-value', 'paragraph-styles.body.space-before'],
      ['invalid-value', 'paragraph-styles.body.indent-left'],
      ['invalid-value', 'paragraph-styles.body.first-line-indent'],
      ['invalid-value', 'paragraph-styles.body.line-spacing'],
      ['invalid-value', 'paragraph-styles.body.variants.strong.size'],
      ['invalid-value', 'table-styles.table.border.inside-vertical.width'],
      ['raw-color', 'table-styles.table.border.inside-vertical.color'],
      ['invalid-value', 'table-styles.table.cell-padding'],
    ]);
  });

  describe('colors and fonts that are not tokens (ADR 0065)', () => {
    const messages = (stylesheet: ReturnType<typeof sheet>): string[] =>
      validateStylesheet(stylesheet).map((d) => `${d.code}: ${d.message}`);

    it('names the token that has the color, or says to add one', () => {
      const stylesheet = sheet({
        colors: { brand: '#2E75B6' },
        paragraph: {
          body: {
            text: { color: hex('#2E75B6'), highlight: hex('#112233') },
            paragraph: {},
            variants: {},
          },
        },
      });
      expect(messages(stylesheet)).toEqual([
        'raw-color: Colors come from the color tokens. Use the token "brand" (#2E75B6) here.',
        'raw-color: Colors come from the color tokens. Add #112233 to tokens.colors under a name, and use that name here.',
      ]);
    });

    it('names the token that has the families, or says to add one', () => {
      const stylesheet = sheet({
        fonts: { body: ['Calibri', 'Arial'] },
        paragraph: {
          body: {
            text: { font: { kind: 'families', families: ['Calibri', 'Arial'] } },
            paragraph: {},
            variants: { code: { font: { kind: 'families', families: ['Courier'] } } },
          },
        },
      });
      expect(messages(stylesheet)).toEqual([
        'raw-font: Fonts come from the font tokens. Use the token "body" here.',
        'raw-font: Fonts come from the font tokens. Add the families to tokens.fonts under a name, and use that name here.',
      ]);
    });

    it('finds a raw color wherever a style has one', () => {
      const raw = hex('#112233');
      const stylesheet = sheet({
        paragraph: {
          body: {
            text: { color: raw, highlight: raw },
            paragraph: { background: raw },
            variants: { strong: { color: raw } },
          },
        },
        character: { marker: { text: { color: raw } } },
        table: {
          table: {
            border: { outer: { widthPt: 1, color: raw } },
            headerRow: { text: { color: raw }, background: raw },
            bandedRows: { odd: raw, even: raw },
          },
        },
      });
      expect(problems(stylesheet)).toEqual([
        ['raw-color', 'paragraph-styles.body.color'],
        ['raw-color', 'paragraph-styles.body.highlight'],
        ['raw-color', 'paragraph-styles.body.background'],
        ['raw-color', 'paragraph-styles.body.variants.strong.color'],
        ['raw-color', 'character-styles.marker.color'],
        ['raw-color', 'table-styles.table.border.outer.color'],
        ['raw-color', 'table-styles.table.header-row.color'],
        ['raw-color', 'table-styles.table.header-row.background'],
        ['raw-color', 'table-styles.table.banded-rows.odd'],
        ['raw-color', 'table-styles.table.banded-rows.even'],
        ['header-property-overridden', 'table-styles.table.header-row.color'],
      ]);
    });

    it('accepts the values of the tokens themselves, and tokens used by name', () => {
      const stylesheet = sheet({
        colors: { brand: '#2E75B6' },
        fonts: { body: ['Arial'] },
        paragraph: {
          body: {
            text: { color: token('brand'), font: token('body') },
            paragraph: {},
            variants: {},
          },
        },
      });
      expect(validateStylesheet(stylesheet)).toEqual([]);
    });
  });
});
