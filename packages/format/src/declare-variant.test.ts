import { readFileSync } from 'node:fs';
import { markAllowed, type StyleName } from '@phrase/core';
import { describe, expect, it } from 'vitest';
import { declareVariant } from './declare-variant.js';
import { parseStylesheet } from './stylesheet.js';

const name = (value: string) => value as StyleName;

const fixture = readFileSync(
  new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');

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

function declared(source: string, style: string, mark: Parameters<typeof declareVariant>[2]) {
  const result = declareVariant(source, name(style), mark);
  if (!result.ok) throw new Error(result.message);
  return result.text;
}

describe('declareVariant on the example stylesheet', () => {
  it('adds a variants block to a style that has none, and changes nothing else', () => {
    const text = declared(fixture, 'heading-3', 'strong');
    expect(text).toBe(
      fixture.replace(
        '    size: 12\n',
        '    size: 12\n    variants:\n      strong: { bold: true }\n',
      ),
    );
    const parsed = parseStylesheet(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(markAllowed(parsed.stylesheet, name('heading-3'), 'strong')).toBe(true);
    expect(markAllowed(parsed.stylesheet, name('heading-2'), 'strong')).toBe(false);
  });

  it('replaces a variant that is switched off', () => {
    const text = declared(fixture, 'heading-1', 'strong');
    expect(text).toBe(
      fixture.replace(
        '      strong: false\n      emphasis: {',
        '      strong: { bold: true }\n      emphasis: {',
      ),
    );
  });

  it('leaves the text as it was when the variant is declared already', () => {
    expect(declared(fixture, 'body', 'strong')).toBe(fixture);
  });
});

describe('declareVariant', () => {
  it('replaces an empty style', () => {
    expect(declared(sheet('  body: {}\n'), 'body', 'emphasis')).toBe(
      sheet('  body:\n    variants:\n      emphasis: { italic: true }\n'),
    );
  });

  it('adds after the last line of the style, keeping the comment on it', () => {
    expect(declared(sheet('  body:\n    size: 11 # points\n'), 'body', 'link')).toBe(
      sheet('  body:\n    size: 11 # points\n    variants:\n      link: { underline: true }\n'),
    );
  });

  it('adds to variants that are there, with their indentation', () => {
    expect(
      declared(sheet('  body:\n    variants:\n        emphasis: {} # kept\n'), 'body', 'strong'),
    ).toBe(
      sheet(
        '  body:\n    variants:\n        emphasis: {} # kept\n        strong: { bold: true }\n',
      ),
    );
  });

  it('keeps a comment on a variant that is replaced', () => {
    expect(
      declared(sheet('  body:\n    variants:\n      strong: false # off\n'), 'body', 'strong'),
    ).toBe(sheet('  body:\n    variants:\n      strong: { bold: true } # off\n'));
  });

  it('declares code with no properties', () => {
    expect(declared(sheet('  body: {}\n'), 'body', 'code')).toBe(
      sheet('  body:\n    variants:\n      code: {}\n'),
    );
  });

  it('works on the last style of the file without a final newline', () => {
    const source = `phrase-format: 1\ntable-styles:\n  table: {}\nparagraph-styles:\n${OTHERS}  body:\n    size: 11`;
    expect(declared(source, 'body', 'strong')).toBe(
      `${source}\n    variants:\n      strong: { bold: true }`,
    );
  });

  it('keeps the line endings of the file', () => {
    const source = sheet('  body:\n    size: 11\n').replaceAll('\n', '\r\n');
    const text = declared(source, 'body', 'strong');
    expect(text).toBe(
      declared(sheet('  body:\n    size: 11\n'), 'body', 'strong').replaceAll('\n', '\r\n'),
    );
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('refuses a style that is not there, and a file that is not YAML', () => {
    expect(declareVariant(sheet('  body: {}\n'), name('nope'), 'strong')).toMatchObject({
      ok: false,
      code: 'unknown-style',
    });
    expect(declareVariant('paragraph-styles: [', name('body'), 'strong')).toMatchObject({
      ok: false,
      code: 'invalid-stylesheet',
    });
  });

  it('edits a style, and variants, that are written on one line', () => {
    expect(declared(sheet('  body: { size: 11 }\n'), 'body', 'strong')).toBe(
      sheet('  body: { size: 11, variants: { strong: { bold: true } } }\n'),
    );
    expect(declared(sheet('  body:\n    variants: { emphasis: {} }\n'), 'body', 'strong')).toBe(
      sheet('  body:\n    variants: { emphasis: {}, strong: { bold: true } }\n'),
    );
  });

  it('refuses layouts it cannot edit without guessing', () => {
    for (const body of ['  body:\n    variants:\n      strong: null\n']) {
      expect(declareVariant(sheet(body), name('body'), 'strong')).toMatchObject({
        ok: false,
        code: 'unsupported-layout',
      });
    }
  });
});
