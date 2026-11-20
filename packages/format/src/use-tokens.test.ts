import { describe, expect, it } from 'vitest';
import { moveValuesToTokens } from './use-tokens.js';
import { parseStylesheet } from './stylesheet.js';

const OLD = `stanza-format: 1

# Colors and fonts are named here once.
tokens:
  colors:
    brand: '#2E75B6'
    surface: '#F2F2F2'
  fonts:
    body: ['Calibri', 'Arial']

paragraph-styles:
  body:
    font: body
    size: 11
  code:
    based-on: body
    font: ['Consolas', 'Courier New'] # monospaced
    background: '#F2F2F2'
    variants:
      link: { color: '#2E75B6', underline: true }

table-styles:
  table:
    header-row:
      bold: true
      background: '#DDEEFF'
    banded-rows:
      odd: '#FFFFFF'
      even: '#DDEEFF'
`;

const codes = (text: string): string[] =>
  parseStylesheet(text)
    .diagnostics.map((d) => d.code)
    .filter(
      (code) => code.startsWith('raw-') || code === 'unknown-token' || code === 'invalid-value',
    );

describe('moveValuesToTokens', () => {
  it('moves raw colors and fonts into tokens and keeps the rest of the file', () => {
    const result = moveValuesToTokens(OLD);
    if (!result.ok) throw new Error(result.message);
    expect(result).toMatchObject({ moved: 6, added: 3 });
    expect(codes(result.text)).toEqual([]);

    const { stylesheet } = parseStylesheet(result.text);
    expect([...stylesheet.tokens.colors]).toEqual([
      ['brand', '#2E75B6'],
      ['surface', '#F2F2F2'],
      ['color-ddeeff', '#DDEEFF'],
      ['color-ffffff', '#FFFFFF'],
    ]);
    expect(stylesheet.tokens.fonts.get('font-consolas-courier-new')).toEqual([
      'Consolas',
      'Courier New',
    ]);
    expect(result.text).toContain('# Colors and fonts are named here once.');
    expect(result.text).toContain('font: font-consolas-courier-new # monospaced');
    expect(result.text).toContain('background: surface');
    expect(result.text).toContain('link: { color: brand, underline: true }');
    expect(result.text).toContain('odd: color-ffffff');
  });

  it('gives the same text twice, and leaves a stylesheet without raw values alone', () => {
    const once = moveValuesToTokens(OLD);
    if (!once.ok) throw new Error(once.message);
    expect(moveValuesToTokens(once.text)).toEqual({
      ok: true,
      text: once.text,
      moved: 0,
      added: 0,
    });
    expect(moveValuesToTokens(OLD)).toEqual(once);
  });

  it('adds the tokens sections when the stylesheet has none, and keeps CRLF', () => {
    const source = "stanza-format: 1\r\nparagraph-styles:\r\n  body:\r\n    color: '#112233'\r\n";
    const result = moveValuesToTokens(source);
    if (!result.ok) throw new Error(result.message);
    expect(result.text).toContain('color: color-112233');
    expect(result.text).toContain('color-112233:');
    expect(result.text.replaceAll('\r\n', '')).not.toContain('\n');
    expect(codes(result.text)).toEqual([]);
  });

  it('does not take the name of a token that holds another value', () => {
    const source = `stanza-format: 1
tokens:
  colors:
    color-112233: '#445566'
paragraph-styles:
  body:
    color: '#112233'
`;
    const result = moveValuesToTokens(source);
    if (!result.ok) throw new Error(result.message);
    expect(result.text).toContain('color: color-112233-2');
    expect(parseStylesheet(result.text).stylesheet.tokens.colors.get('color-112233-2')).toBe(
      '#112233',
    );
  });

  it('changes nothing when a value cannot be moved or the YAML is broken', () => {
    const block = `stanza-format: 1
paragraph-styles:
  code:
    font:
      - Consolas
`;
    expect(moveValuesToTokens(block)).toMatchObject({ ok: false, code: 'unsupported-layout' });
    expect(moveValuesToTokens('a: [')).toMatchObject({ ok: false, code: 'invalid-stylesheet' });
  });
});
