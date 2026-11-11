import { describe, expect, it } from 'vitest';
import { setProperty, unsetProperty, type YamlValue } from './edit-stylesheet.js';

const OTHERS = [
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
  .map((style) => `  ${style}: {}\n`)
  .join('');

/** A stylesheet with the given text for the style `body`, and the other reserved styles empty. */
const sheet = (body: string): string =>
  `phrase-format: 1\n\nparagraph-styles:\n${body}\n${OTHERS}\ntable-styles:\n  table: {}\n`;

/** A stylesheet with tokens, and the given text for the style `body`. */
const withTokens = (body: string): string =>
  `phrase-format: 1\ntokens:\n  colors:\n    brand: '#2E75B6'\n  fonts:\n    body: ['Calibri']\nparagraph-styles:\n${body}${OTHERS}table-styles:\n  table: {}\n`;

/** A stylesheet with the given text for the table style `table`. */
const withTable = (table: string): string =>
  `phrase-format: 1\ntokens:\n  colors:\n    rule: '#BFBFBF'\n    surface: '#F2F2F2'\n    white: '#FFFFFF'\nparagraph-styles:\n  body: {}\n${OTHERS}table-styles:\n${table}`;

const BODY = ['paragraph-styles', 'body'];

function set(source: string, path: readonly string[], value: YamlValue): string {
  const result = setProperty(source, path, value);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.text;
}

function unset(source: string, path: readonly string[]): string {
  const result = unsetProperty(source, path);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.text;
}

describe('setProperty', () => {
  it('replaces a value where it stands, and keeps the comment after it', () => {
    expect(set(sheet('  body:\n    size: 11 # points\n'), [...BODY, 'size'], 12)).toBe(
      sheet('  body:\n    size: 12 # points\n'),
    );
  });

  it('adds a property after the last line of its mapping, keeping the comment on that line', () => {
    expect(set(sheet('  body:\n    size: 11 # points\n'), [...BODY, 'bold'], true)).toBe(
      sheet('  body:\n    size: 11 # points\n    bold: true\n'),
    );
  });

  it('uses the indentation of the mapping', () => {
    expect(set(sheet('  body:\n      size: 11\n'), [...BODY, 'bold'], true)).toBe(
      sheet('  body:\n      size: 11\n      bold: true\n'),
    );
  });

  it('makes a block of a style that is written {}', () => {
    expect(set(sheet('  body: {}\n'), [...BODY, 'size'], 12)).toBe(
      sheet('  body:\n    size: 12\n'),
    );
  });

  it('replaces a mapping that is written on one line', () => {
    expect(
      set(sheet('  body:\n    line-spacing: { multiple: 1.15 }\n'), [...BODY, 'line-spacing'], {
        exactly: 14,
      }),
    ).toBe(sheet('  body:\n    line-spacing: { exactly: 14 }\n'));
  });

  it('makes the mappings that are missing on the way, as blocks in a block', () => {
    expect(
      set(
        withTable('  table:\n    cell-padding: 4\n'),
        ['table-styles', 'table', 'border', 'outer'],
        {
          width: 0.75,
          color: 'rule',
        },
      ),
    ).toBe(
      withTable(
        '  table:\n    cell-padding: 4\n    border:\n      outer: { width: 0.75, color: rule }\n',
      ),
    );
  });

  it('adds a property to a header row written as a block, and one that is missing', () => {
    const table = '  table:\n    header-row:\n      bold: true\n';
    expect(set(withTable(table), ['table-styles', 'table', 'header-row', 'repeat'], true)).toBe(
      withTable(`${table}      repeat: true\n`),
    );
    expect(
      set(
        withTable('  table:\n    cell-padding: 4\n'),
        ['table-styles', 'table', 'header-row', 'bold'],
        true,
      ),
    ).toBe(withTable('  table:\n    cell-padding: 4\n    header-row:\n      bold: true\n'));
  });

  it('makes the banded rows of a table style, sets one color and takes it off, which removes the empty mapping', () => {
    const path = (key: string): string[] => ['table-styles', 'table', 'banded-rows', key];
    const base = '  table:\n    cell-padding: 4\n';
    const banded = `${base}    banded-rows:\n      odd: surface\n`;
    expect(set(withTable(base), path('odd'), 'surface')).toBe(withTable(banded));
    expect(set(withTable(banded), path('even'), 'white')).toBe(
      withTable(`${banded}      even: white\n`),
    );
    expect(unset(withTable(banded), path('odd'))).toBe(withTable(base));
  });

  describe('in a mapping that is written on one line', () => {
    it('adds a property inside the braces, and replaces one', () => {
      expect(set(sheet('  body: { size: 11 }\n'), [...BODY, 'bold'], true)).toBe(
        sheet('  body: { size: 11, bold: true }\n'),
      );
      expect(set(sheet('  body: { size: 11, bold: true }\n'), [...BODY, 'size'], 12)).toBe(
        sheet('  body: { size: 12, bold: true }\n'),
      );
    });

    it('makes the mappings that are missing, on the same line', () => {
      expect(
        set(sheet('  body: { size: 11 }\n'), [...BODY, 'variants', 'strong'], { bold: true }),
      ).toBe(sheet('  body: { size: 11, variants: { strong: { bold: true } } }\n'));
    });

    it('fills an empty mapping that is inside another', () => {
      expect(
        set(sheet('  body: { variants: {} }\n'), [...BODY, 'variants', 'strong'], { bold: true }),
      ).toBe(sheet('  body: { variants: { strong: { bold: true } } }\n'));
    });
  });

  describe('writes a value as it is written in a stylesheet', () => {
    const body = '  body:\n    size: 11\n';
    it.each<[string, readonly string[], YamlValue, string]>([
      ['a number', ['space-after'], 6, '    space-after: 6\n'],
      ['a negative number', ['first-line-indent'], -18, '    first-line-indent: -18\n'],
      ['a flag', ['numbered'], true, '    numbered: true\n'],
      ['a word', ['alignment'], 'center', '    alignment: center\n'],
      ['a token', ['color'], 'brand', '    color: brand\n'],
      ['a font token', ['font'], 'body', '    font: body\n'],
      ['text, quoted', ['label'], 'Side note', "    label: 'Side note'\n"],
      ['text with an apostrophe', ['label'], "It's", "    label: 'It''s'\n"],
      ['a word that YAML reads as something else', ['label'], 'yes', "    label: 'yes'\n"],
    ])('%s', (_what, key, value, line) => {
      expect(set(withTokens(body), [...BODY, ...key], value)).toBe(withTokens(`${body}${line}`));
    });
  });

  it('leaves the text as it was when the value is the one that is there', () => {
    const source = sheet('  body:\n    size: 11\n');
    expect(set(source, [...BODY, 'size'], 11)).toBe(source);
  });

  it('keeps the line endings of the file', () => {
    const source = sheet('  body:\n    size: 11\n').replaceAll('\n', '\r\n');
    const text = set(source, [...BODY, 'bold'], true);
    expect(text).toBe(sheet('  body:\n    size: 11\n    bold: true\n').replaceAll('\n', '\r\n'));
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('works on the last line of a file with no final newline', () => {
    const source = `phrase-format: 1\ntable-styles:\n  table: {}\nparagraph-styles:\n${OTHERS}  body:\n    size: 11`;
    expect(set(source, [...BODY, 'bold'], true)).toBe(`${source}\n    bold: true`);
  });

  it('is not stopped by an error that the text had, but by one that it did not have', () => {
    const broken = sheet('  body: {}\n').replace('  heading-1: {}', '  heading-1:\n    size: big');
    expect(set(broken, [...BODY, 'bold'], true)).toContain('    bold: true');
    const fixed = set(broken, ['paragraph-styles', 'heading-1', 'size'], 18);
    expect(fixed).toContain('    size: 18');
  });

  describe('refuses', () => {
    const refused = (source: string, path: readonly string[], value: YamlValue) => {
      const result = setProperty(source, path, value);
      if (result.ok) throw new Error('It was not refused.');
      return result;
    };
    const source = sheet('  body:\n    size: 11\n');

    it('a value that the stylesheet would not take, and says why', () => {
      const result = refused(source, [...BODY, 'size'], -1);
      expect(result.code).toBe('invalid-result');
      expect(result.message).toContain('must be greater than zero');
      expect(refused(source, [...BODY, 'colour'], 'red')).toMatchObject({ code: 'invalid-result' });
    });

    it('a raw color or a list of fonts, and names the token to use', () => {
      const raw = withTokens('  body: {}\n');
      expect(refused(raw, [...BODY, 'color'], '#2E75B6').message).toContain('brand');
      expect(refused(raw, [...BODY, 'font'], ['Calibri']).message).toContain('body');
    });

    it('a value that cannot be written on a line, and a number that is not one', () => {
      expect(refused(source, [...BODY, 'label'], 'a\nb').code).toBe('invalid-value');
      expect(refused(source, [...BODY, 'size'], Number.NaN).code).toBe('invalid-value');
      expect(refused(source, [...BODY, 'size'], { 'Not Kebab': 1 }).code).toBe('invalid-value');
    });

    it('a path that is not made of names, and one that is empty', () => {
      expect(refused(source, ['paragraph-styles', 'Body', 'size'], 12).code).toBe('invalid-path');
      expect(refused(source, [], 12).code).toBe('invalid-path');
    });

    it('a text that is not YAML', () => {
      expect(refused('paragraph-styles: [', BODY, {}).code).toBe('invalid-stylesheet');
    });

    it('layouts it cannot edit without guessing', () => {
      // Inside a value that is not a mapping, in place of a block, and on a value that is empty.
      expect(refused(source, [...BODY, 'size', 'x'], 1).code).toBe('unsupported-layout');
      const block = sheet('  body:\n    variants:\n      strong: false\n');
      expect(refused(block, [...BODY, 'variants'], {}).code).toBe('unsupported-layout');
      const empty = sheet('  body:\n    variants:\n      strong: null\n');
      expect(refused(empty, [...BODY, 'variants', 'strong'], {}).code).toBe('unsupported-layout');
    });
  });
});

describe('unsetProperty', () => {
  it('removes the lines of a property with the comment that ends them, and keeps the comment above', () => {
    expect(
      unset(sheet('  body:\n    # the size\n    size: 11 # points\n    bold: true\n'), [
        ...BODY,
        'size',
      ]),
    ).toBe(sheet('  body:\n    # the size\n    bold: true\n'));
  });

  it('removes the last property of a style that has others', () => {
    expect(unset(sheet('  body:\n    size: 11\n    bold: true\n'), [...BODY, 'bold'])).toBe(
      sheet('  body:\n    size: 11\n'),
    );
  });

  it('writes a style that has nothing left as {}, keeping the comment on its line', () => {
    expect(unset(sheet('  body: # base\n    size: 11\n'), [...BODY, 'size'])).toBe(
      sheet('  body: {} # base\n'),
    );
  });

  it('removes a mapping below a style when it has nothing left', () => {
    const source = sheet('  body:\n    size: 11\n    variants:\n      strong: { bold: true }\n');
    expect(unset(source, [...BODY, 'variants', 'strong'])).toBe(sheet('  body:\n    size: 11\n'));
  });

  it('keeps the other entries of a mapping below a style', () => {
    const source = sheet(
      '  body:\n    variants:\n      strong: { bold: true }\n      emphasis: { italic: true }\n',
    );
    expect(unset(source, [...BODY, 'variants', 'strong'])).toBe(
      sheet('  body:\n    variants:\n      emphasis: { italic: true }\n'),
    );
  });

  it('writes a style as {} when the removed mapping was all it had', () => {
    const source = sheet('  body:\n    variants:\n      strong: { bold: true }\n');
    expect(unset(source, [...BODY, 'variants', 'strong'])).toBe(sheet('  body: {}\n'));
  });

  describe('in a mapping that is written on one line', () => {
    const source = sheet('  body: { size: 11, bold: true }\n');
    it('removes the first, and the last', () => {
      expect(unset(source, [...BODY, 'size'])).toBe(sheet('  body: { bold: true }\n'));
      expect(unset(source, [...BODY, 'bold'])).toBe(sheet('  body: { size: 11 }\n'));
    });

    it('writes {} when it was the only one', () => {
      expect(unset(sheet('  body: { size: 11 }\n'), [...BODY, 'size'])).toBe(sheet('  body: {}\n'));
    });
  });

  it('leaves the text as it was for a property that is not there', () => {
    const source = sheet('  body:\n    size: 11\n');
    expect(unset(source, [...BODY, 'bold'])).toBe(source);
    expect(unset(source, ['paragraph-styles', 'nope', 'bold'])).toBe(source);
    expect(unset(source, [...BODY, 'size', 'x'])).toBe(source);
  });

  it('works on the last line of a file with no final newline', () => {
    const head = `phrase-format: 1\ntable-styles:\n  table: {}\nparagraph-styles:\n${OTHERS}  body:\n    size: 11`;
    expect(unset(`${head}\n    bold: true`, [...BODY, 'bold'])).toBe(head);
  });

  it('keeps the line endings of the file', () => {
    const source = sheet('  body:\n    size: 11\n    bold: true\n').replaceAll('\n', '\r\n');
    expect(unset(source, [...BODY, 'bold'])).toBe(
      sheet('  body:\n    size: 11\n').replaceAll('\n', '\r\n'),
    );
  });

  it('refuses a removal that would leave an invalid stylesheet', () => {
    const result = unsetProperty(sheet('  body: {}\n'), BODY);
    expect(result).toMatchObject({ ok: false, code: 'invalid-result' });
  });
});
