import { readFileSync } from 'node:fs';
import { markAllowed, resolveTextProps, type Mark, type StyleName } from '@phrase/core';
import { describe, expect, it } from 'vitest';
import { parseStylesheet } from './stylesheet.js';

const fixture = readFileSync(
  new URL('../../../fixtures/stylesheet/default.yaml', import.meta.url),
  'utf8',
);

const HEADER = 'phrase-format: 1\n';

/** The reserved styles, so that only the part under test can cause diagnostics. */
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
  .map((name) => `  ${name}: {}`)
  .join('\n');

function sheet(extra: string): string {
  return `${HEADER}${extra}\nparagraph-styles:\n${RESERVED}\ntable-styles:\n  table: {}\n`;
}

function problems(source: string): string[][] {
  return parseStylesheet(source).diagnostics.map((d) => [d.code, d.path ?? '']);
}

const name = (value: string) => value as StyleName;

describe('the default stylesheet fixture', () => {
  const result = parseStylesheet(fixture);

  it('is read without diagnostics', () => {
    expect(result.diagnostics).toEqual([]);
    expect(result.formatVersion).toBe(1);
  });

  it('has the reserved styles and the extra ones', () => {
    expect([...result.stylesheet.paragraphStyles.keys()]).toContain('cover-title');
    expect([...result.stylesheet.characterStyles.keys()]).toEqual(['marker', 'muted']);
    expect([...result.stylesheet.tableStyles.keys()]).toEqual(['table', 'table-grid']);
    expect(result.stylesheet.tokens.colors.get('brand')).toBe('#2E75B6');
    expect(result.stylesheet.tokens.fonts.get('mono')).toEqual(['Consolas', 'Courier New']);
  });

  it('reads values with the right types and units', () => {
    expect(result.stylesheet.paragraphStyles.get(name('body'))).toEqual({
      text: { font: { kind: 'token', name: 'body' }, sizePt: 11 },
      paragraph: { spaceAfterPt: 6, lineSpacing: { rule: 'multiple', factor: 1.15 } },
      variants: {
        strong: { bold: true },
        emphasis: { italic: true },
        code: { font: { kind: 'token', name: 'mono' }, sizePt: 10 },
        link: { color: { kind: 'token', name: 'brand' }, underline: true },
      },
    });
    expect(result.stylesheet.paragraphStyles.get(name('list-bulleted'))?.paragraph).toEqual({
      spaceAfterPt: 3,
      indentLeftPt: 36,
      firstLineIndentPt: -18,
    });
    expect(result.stylesheet.characterStyles.get(name('marker'))?.text.highlight).toEqual({
      kind: 'hex',
      hex: '#FFFFFF',
    });
  });

  it('applies the rules of the stylesheet', () => {
    const { stylesheet } = result;
    expect(markAllowed(stylesheet, name('body'), 'strong')).toBe(true);
    expect(markAllowed(stylesheet, name('heading-2'), 'strong')).toBe(false);
    expect(markAllowed(stylesheet, name('heading-2'), 'emphasis')).toBe(true);
    expect(markAllowed(stylesheet, name('code'), 'link')).toBe(false);
    const marks: Mark[] = [{ type: 'style', name: name('marker') }];
    expect(resolveTextProps(stylesheet, name('body'), marks)).toEqual(
      expect.objectContaining({ sizePt: 11, bold: true, color: { kind: 'token', name: 'brand' } }),
    );
  });
});

describe('parseStylesheet', () => {
  it('reports invalid YAML and a missing format version', () => {
    expect(problems('a: [\n')[0]?.[0]).toBe('invalid-yaml');
    expect(problems('paragraph-styles: {}\n')).toContainEqual([
      'format-version-missing',
      'phrase-format',
    ]);
    expect(problems('phrase-format: 2\n')).toContainEqual([
      'format-version-unsupported',
      'phrase-format',
    ]);
  });

  it('reports unknown properties at every level', () => {
    const source = sheet(
      'extra: 1\ncharacter-styles:\n  marker:\n    bolder: true\ntokens:\n  shades: {}',
    ).replace(
      '  body: {}',
      '  body:\n    sizes: 10\n    variants:\n      underline: {}\n      strong:\n        weight: 1',
    );
    expect(problems(source)).toEqual([
      ['unknown-property', 'extra'],
      ['unknown-property', 'tokens.shades'],
      ['unknown-property', 'paragraph-styles.body.sizes'],
      ['unknown-property', 'paragraph-styles.body.variants.underline'],
      ['unknown-property', 'paragraph-styles.body.variants.strong.weight'],
      ['unknown-property', 'character-styles.marker.bolder'],
    ]);
  });

  it('reports values of the wrong type', () => {
    const source = sheet('').replace(
      '  body: {}',
      [
        '  body:',
        '    size: big',
        '    bold: yes',
        '    color: 12',
        '    font: 3',
        '    alignment: middle',
        '    line-spacing: { at-least: 12, multiple: 1 }',
        '    variants: { strong: true }',
      ].join('\n'),
    );
    expect(problems(source)).toEqual([
      ['invalid-type', 'paragraph-styles.body.font'],
      ['invalid-type', 'paragraph-styles.body.size'],
      ['invalid-type', 'paragraph-styles.body.bold'],
      ['invalid-type', 'paragraph-styles.body.color'],
      ['invalid-value', 'paragraph-styles.body.line-spacing'],
      ['invalid-value', 'paragraph-styles.body.alignment'],
      ['invalid-type', 'paragraph-styles.body.variants.strong'],
    ]);
  });

  it('explains that an unquoted # starts a comment', () => {
    const source = sheet('').replace('  body: {}', '  body:\n    color: #2E75B6');
    const [first] = parseStylesheet(source).diagnostics;
    expect(first).toEqual(
      expect.objectContaining({ code: 'invalid-type', path: 'paragraph-styles.body.color' }),
    );
    expect(first?.message).toMatch(/quote color values/);
  });

  it('reports invalid names', () => {
    const source = `${HEADER}tokens:\n  colors:\n    Bad_Name: "#000000"\ncharacter-styles:\n  Not_Kebab: {}\n`;
    expect(problems(source)).toEqual([
      ['invalid-name', 'tokens.colors.Bad_Name'],
      ['invalid-name', 'character-styles.Not_Kebab'],
    ]);
  });

  it('requires both width and color on a border', () => {
    const source = sheet('').replace(
      '  table: {}',
      '  table:\n    border:\n      outer: { width: 1 }\n      inside-vertical: { color: "#000000" }',
    );
    expect(problems(source)).toEqual([
      ['missing-property', 'table-styles.table.border.outer.color'],
      ['missing-property', 'table-styles.table.border.inside-vertical.width'],
    ]);
  });

  it('runs the semantic checks once the file has been read cleanly', () => {
    expect(problems(`${HEADER}paragraph-styles:\n  body: {}\n`)).toContainEqual([
      'missing-reserved-style',
      'paragraph-styles.heading-1',
    ]);
    const source = sheet('').replace(
      '  body: {}',
      '  body:\n    based-on: nowhere\n    color: ghost',
    );
    expect(problems(source)).toEqual([
      ['unknown-base-style', 'paragraph-styles.body.based-on'],
      ['unknown-token', 'paragraph-styles.body.color'],
    ]);
  });

  it('skips the semantic checks when reading the file already failed', () => {
    expect(problems(`${HEADER}paragraph-styles:\n  body:\n    size: big\n`)).toEqual([
      ['invalid-type', 'paragraph-styles.body.size'],
    ]);
  });

  it('accepts CRLF line endings and a byte order mark', () => {
    const result = parseStylesheet(`\uFEFF${fixture.replace(/\n/g, '\r\n')}`);
    expect(result.diagnostics).toEqual([]);
  });
});
