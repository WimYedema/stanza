import { readFileSync } from 'node:fs';
import type { Stylesheet } from '@stanza/core';
import { parseStylesheet } from '@stanza/format';
import { describe, expect, it } from 'vitest';
import { compileStylesheetToCss } from './compile.js';
import {
  LIST_CLASS,
  SCOPE_CLASS,
  characterClass,
  listItemClass,
  markClass,
  paragraphClass,
  tableClass,
} from './class-names.js';

const RESERVED = [
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'code',
  'list-bulleted',
  'list-numbered',
];

/** A stylesheet with the reserved styles and the given parts. `body` and `table` are overridable. */
function sheet(extra: string, body = '  body: {}\n', table = '  table: {}\n'): Stylesheet {
  const source = `stanza-format: 1\n${extra}\nparagraph-styles:\n${body}${RESERVED.map(
    (name) => `  ${name}: {}\n`,
  ).join('')}table-styles:\n${table}`;
  const result = parseStylesheet(source);
  expect(result.diagnostics).toEqual([]);
  return result.stylesheet;
}

/** A stylesheet that lacks the reserved style `code`, so it does not validate. */
function sheetWithoutCode(): Stylesheet {
  const names = ['body', ...RESERVED.filter((name) => name !== 'code')];
  const body = names.map((name) => `  ${name}: {}\n`).join('');
  const source = `stanza-format: 1\nparagraph-styles:\n${body}table-styles:\n  table: {}\n`;
  return parseStylesheet(source).stylesheet;
}

function css(stylesheet: Stylesheet, scopeClass?: string): string {
  const result = compileStylesheetToCss(stylesheet, scopeClass === undefined ? {} : { scopeClass });
  expect(result.diagnostics).toEqual([]);
  if (result.css === undefined) throw new Error('No CSS.');
  return result.css;
}

/** The declarations of the rule with exactly this selector list. */
function rule(text: string, selector: string): string[] {
  const start = text.indexOf(`${selector} {\n`);
  if (start < 0) throw new Error(`No rule for ${selector}.`);
  const from = start + selector.length + 3;
  return text
    .slice(from, text.indexOf('\n}', from))
    .split('\n')
    .map((line) => line.trim());
}

const EXAMPLE = parseStylesheet(
  readFileSync(
    new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
    'utf8',
  ),
).stylesheet;

describe('class names', () => {
  it('are written once and used by the rules', () => {
    const name = 'body' as Parameters<typeof paragraphClass>[0];
    expect(SCOPE_CLASS).toBe('stanza-document');
    expect(LIST_CLASS).toBe('stanza-list');
    expect(paragraphClass(name)).toBe('stanza-p-body');
    expect(listItemClass(name)).toBe('stanza-li-body');
    expect(characterClass(name)).toBe('stanza-c-body');
    expect(tableClass(name)).toBe('stanza-t-body');
    expect(markClass('strong')).toBe('stanza-m-strong');
  });
});

describe('compileStylesheetToCss', () => {
  it('shows a white paper, whatever the theme of the host', () => {
    expect(rule(css(sheet('')), '.stanza-document')).toEqual([
      'background-color: #FFFFFF;',
      'color: #000000;',
      'font-size: 11pt;',
    ]);
  });

  it('writes every rule under the scope, which can be changed', () => {
    const text = css(sheet(''), 'editor');
    expect(text).toContain('.editor .stanza-p-body {');
    expect(text).not.toContain('.stanza-document');
  });

  it('refuses a scope that is not a class name', () => {
    for (const scope of ['', 'a b', '.a', 'a{}', '1a']) {
      const result = compileStylesheetToCss(sheet(''), { scopeClass: scope });
      expect(result.css).toBeUndefined();
      expect(result.diagnostics.map((d) => d.code)).toEqual(['invalid-scope-class']);
    }
  });

  it('gives nothing back for a stylesheet with errors', () => {
    const result = compileStylesheetToCss(sheetWithoutCode());
    expect(result.css).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toContain('missing-reserved-style');
  });

  it('writes the resolved properties of a style, with a reset below them', () => {
    const text = css(
      sheet(
        'tokens:\n  colors:\n    brand: "#2E75B6"\n    pale: "#EEEEEE"\n  fonts:\n    serif: ["Georgia", "Times New Roman"]',
        `  body:
    font: serif
    size: 11
    color: brand
    space-before: 3
    space-after: 6
    indent-left: 36
    first-line-indent: -18
    alignment: justify
    background: pale
    line-spacing: { multiple: 1.15 }
`,
      ),
    );
    expect(rule(text, '.stanza-document .stanza-p-body')).toEqual([
      'margin-top: 3pt;',
      'margin-bottom: 6pt;',
      'margin-left: 36pt;',
      'text-indent: -18pt;',
      'font-size: 11pt;',
      'font-weight: 400;',
      'font-style: normal;',
      'font-family: "Georgia", "Times New Roman";',
      'color: #2E75B6;',
      'line-height: 1.15;',
      'text-align: justify;',
      'background-color: #EEEEEE;',
    ]);
  });

  it('resets what a browser adds when a style sets nothing', () => {
    expect(rule(css(sheet('')), '.stanza-document .stanza-p-code')).toEqual([
      'margin-top: 0;',
      'margin-bottom: 0;',
      'margin-left: 0;',
      'text-indent: 0;',
      'font-size: inherit;',
      'font-weight: 400;',
      'font-style: normal;',
    ]);
  });

  it('inherits through based-on, and a derived style overrides what it sets', () => {
    const text = css(
      sheet(
        '',
        '  body:\n    size: 11\n    bold: true\n    space-after: 6\n  heading-1x:\n    based-on: body\n    size: 18\n    bold: false\n',
      ),
    );
    expect(rule(text, '.stanza-document .stanza-p-heading-1x')).toEqual([
      'margin-top: 0;',
      'margin-bottom: 6pt;',
      'margin-left: 0;',
      'text-indent: 0;',
      'font-size: 18pt;',
      'font-weight: 400;',
      'font-style: normal;',
    ]);
  });

  it('writes the line spacing rules as a factor or as points', () => {
    const lines = (spacing: string): string =>
      rule(
        css(sheet('', `  body: { line-spacing: ${spacing} }\n`)),
        '.stanza-document .stanza-p-body',
      ).find((line) => line.startsWith('line-height')) ?? '';
    expect(lines('{ multiple: 1.5 }')).toBe('line-height: 1.5;');
    expect(lines('{ exactly: 14 }')).toBe('line-height: 14pt;');
    expect(lines('{ at-least: 12.5 }')).toBe('line-height: 12.5pt;');
  });

  it('does not write what has no meaning in continuous editing', () => {
    const text = css(
      sheet('', '  body: { keep-with-next: true, keep-together: true, page-break-before: true }\n'),
    );
    expect(text).not.toMatch(/keep|break/);
  });

  it('gives list items a rule without a first-line indent, since markers hang outside', () => {
    const text = css(
      sheet('', '  body: {}\n  list-x:\n    indent-left: 18\n    first-line-indent: -9\n'),
    );
    expect(rule(text, '.stanza-document .stanza-li-list-x')).toEqual([
      'margin-top: 0;',
      'margin-bottom: 0;',
      'margin-left: 18pt;',
      'font-size: inherit;',
      'font-weight: 400;',
      'font-style: normal;',
    ]);
    expect(rule(text, '.stanza-document .stanza-p-list-x')).toContain('text-indent: -9pt;');
    expect(rule(text, '.stanza-document .stanza-list')).toEqual(['margin: 0;', 'padding: 0;']);
  });

  it('writes a mark as a rule under its paragraph style and its list item, only if allowed', () => {
    const text = css(
      sheet(
        '',
        '  body:\n    variants:\n      strong: { bold: true }\n      emphasis: {}\n      link: { underline: true }\n  plain: {}\n  sans:\n    based-on: body\n    variants:\n      link: false\n',
      ),
    );
    const selector =
      '.stanza-document .stanza-p-body .stanza-m-strong,\n.stanza-document .stanza-li-body .stanza-m-strong';
    expect(rule(text, selector)).toEqual(['font-weight: 700;']);
    // A variant without properties is allowed but has nothing to write.
    expect(text).not.toContain('.stanza-p-body .stanza-m-emphasis');
    expect(text).toContain('.stanza-p-body .stanza-m-link');
    // A style without the variant gets no rule, and a variant that is switched off neither.
    expect(text).not.toContain('.stanza-p-plain .stanza-m-');
    expect(text).toContain('.stanza-p-sans .stanza-m-strong');
    expect(text).not.toContain('.stanza-p-sans .stanza-m-link');
  });

  it('writes a character style with its bases applied', () => {
    const out = css(
      sheet(
        'tokens:\n  colors:\n    muted: "#7F7F7F"\ncharacter-styles:\n  marker:\n    bold: true\n  loud:\n    based-on: marker\n    color: muted\n  empty: {}',
      ),
    );
    expect(rule(out, '.stanza-document .stanza-c-marker')).toEqual(['font-weight: 700;']);
    expect(rule(out, '.stanza-document .stanza-c-loud')).toEqual([
      'font-weight: 700;',
      'color: #7F7F7F;',
    ]);
    expect(out).not.toContain('stanza-c-empty');
  });

  it('escapes what could end a CSS string or the style element', () => {
    const text = css(
      sheet(
        'tokens:\n  fonts:\n    odd: ["A\\"B", "C</style><b>", "D\\\\E", "F\\nG"]',
        '  body:\n    font: odd\n',
      ),
    );
    const line = rule(text, '.stanza-document .stanza-p-body').find((l) =>
      l.startsWith('font-family'),
    );
    expect(line).toBe(
      'font-family: "A\\22 B", "C\\3c /style\\3e \\3c b\\3e ", "D\\5c E", "F\\a G";',
    );
    expect(text).not.toContain('</style>');
  });

  it('writes a table with its borders, padding and header row', () => {
    const text = css(
      sheet(
        'tokens:\n  colors:\n    rule: "#BFBFBF"\n    black: "#000000"\n    surface: "#F2F2F2"',
        '  body: {}\n',
        `  table:
    border:
      outer: { width: 0.75, color: rule }
      inside-horizontal: { width: 0.5, color: black }
    header-row:
      bold: true
      background: surface
    cell-padding: 4
  table-grid:
    based-on: table
    border:
      inside-vertical: { width: 0.5, color: rule }
`,
      ),
    );
    expect(rule(text, '.stanza-document .stanza-t-table')).toEqual([
      'border-collapse: collapse;',
      'width: 100%;',
      'border: 0.75pt solid #BFBFBF;',
    ]);
    expect(rule(text, '.stanza-document .stanza-t-table tr + tr > *')).toEqual([
      'border-top: 0.5pt solid #000000;',
    ]);
    expect(text).not.toContain('stanza-t-table tr > * + *');
    expect(rule(text, '.stanza-document .stanza-t-table-grid tr > * + *')).toEqual([
      'border-left: 0.5pt solid #BFBFBF;',
    ]);
    expect(
      rule(text, '.stanza-document .stanza-t-table th,\n.stanza-document .stanza-t-table td'),
    ).toEqual(['padding: 4pt;', 'text-align: left;', 'vertical-align: top;']);
    expect(rule(text, '.stanza-document .stanza-t-table th')).toEqual([
      'font-weight: 700;',
      'background-color: #F2F2F2;',
    ]);
    // The paragraphs and list items of a header cell have their own reset, so they get the header text.
    expect(
      rule(text, '.stanza-document .stanza-t-table th p,\n.stanza-document .stanza-t-table th li'),
    ).toEqual(['font-weight: 700;']);
  });

  it('writes banded rows by their place among the body rows, not counting the header row', () => {
    const text = css(
      sheet(
        'tokens:\n  colors:\n    band: "#EEEEEE"\n    white: "#FFFFFF"\n    grey: "#DDDDDD"',
        '  body: {}\n',
        `  table:
    banded-rows:
      odd: band
      even: white
  table-b:
    based-on: table
    banded-rows:
      even: grey
`,
      ),
    );
    const bands = (table: string, odd: boolean): string => {
      const headed = `.stanza-document .stanza-t-${table}:has(tr:first-child > th)`;
      const headless = `.stanza-document .stanza-t-${table}:not(:has(tr:first-child > th))`;
      return odd
        ? `${headed} tr:nth-child(even) > td,\n${headless} tr:nth-child(odd) > td`
        : `${headed} tr:nth-child(odd) > td,\n${headless} tr:nth-child(even) > td`;
    };
    expect(rule(text, bands('table', true))).toEqual(['background-color: #EEEEEE;']);
    expect(rule(text, bands('table', false))).toEqual(['background-color: #FFFFFF;']);
    expect(rule(text, bands('table-b', true))).toEqual(['background-color: #EEEEEE;']);
    expect(rule(text, bands('table-b', false))).toEqual(['background-color: #DDDDDD;']);
    expect(css(sheet(''))).not.toContain(':has(');
  });

  it('does not let the browser style header cells of a table without a header row', () => {
    expect(rule(css(sheet('')), '.stanza-document .stanza-t-table th')).toEqual([
      'font-weight: 400;',
    ]);
    expect(css(sheet(''))).not.toContain('stanza-t-table th p');
  });

  it('compiles the example stylesheet to the same text every time, without gaps', () => {
    const first = css(EXAMPLE);
    expect(css(EXAMPLE)).toBe(first);
    expect(first).not.toMatch(/undefined|NaN|\[object/);
    expect(first).toContain('.stanza-document .stanza-p-cover-title {');
    expect(first).toContain('font-family: "Calibri", "Arial";');
    expect(first.endsWith('}\n')).toBe(true);
  });
});
