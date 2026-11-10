import { readFileSync } from 'node:fs';
import {
  markAllowed,
  resolveParagraphStyle,
  resolveTextProps,
  type Mark,
  type StyleName,
} from '@phrase/core';
import { describe, expect, it } from 'vitest';
import { parseStylesheet } from './stylesheet.js';

const fixture = readFileSync(
  new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
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

describe('the label of a style', () => {
  const withLabels = (): string =>
    sheet('')
      .replace('  body: {}', "  body:\n    label: 'Normal text'")
      .replace('  table: {}', "  table:\n    label: 'Plain table'")
      .concat("character-styles:\n  marker:\n    label: 'Status marker'\n    bold: true\n");

  it('is read on paragraph, character and table styles', () => {
    const result = parseStylesheet(withLabels());
    expect(result.diagnostics).toEqual([]);
    expect(result.stylesheet.paragraphStyles.get(name('body'))?.label).toBe('Normal text');
    expect(result.stylesheet.characterStyles.get(name('marker'))?.label).toBe('Status marker');
    expect(result.stylesheet.tableStyles.get(name('table'))?.label).toBe('Plain table');
  });

  it('is absent when the file gives none', () => {
    const result = parseStylesheet(sheet(''));
    expect(result.stylesheet.paragraphStyles.get(name('body'))).not.toHaveProperty('label');
  });

  it('is reported when it is not text', () => {
    const source = sheet('').replace('  body: {}', '  body:\n    label: 12');
    expect(problems(source)).toEqual([['invalid-type', 'paragraph-styles.body.label']]);
  });

  it('is checked for what Word would make of it', () => {
    const source = sheet('').replace('  heading-1: {}', "  heading-1:\n    label: 'a, b'");
    expect(problems(source)).toEqual([['invalid-label', 'paragraph-styles.heading-1.label']]);
  });
});

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

  it('reads the page templates', () => {
    const { pageTemplates } = result.stylesheet;
    expect([...pageTemplates.keys()]).toEqual(['page', 'page-letter']);
    const page = pageTemplates.get(name('page'));
    expect(page?.size).toBe('A4');
    expect(page?.margins).toEqual({ topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 });
    const letter = pageTemplates.get(name('page-letter'));
    expect(letter?.size).toBe('Letter');
    expect(letter?.margins).toEqual({ topPt: 54, rightPt: 90, bottomPt: 54, leftPt: 90 });
  });

  it('reads the slots of headers and footers, with tokens written as links', () => {
    const page = result.stylesheet.pageTemplates.get(name('page'));
    expect(page?.header).toEqual({
      style: 'header-footer',
      left: [{ kind: 'token', token: 'title', label: '' }],
      center: [],
      right: [{ kind: 'token', token: 'classification', label: '' }],
    });
    expect(page?.footer?.right).toEqual([
      { kind: 'text', text: 'Page ' },
      { kind: 'token', token: 'page', label: '1' },
      { kind: 'text', text: ' of ' },
      { kind: 'token', token: 'pages', label: '1' },
    ]);
    const letter = result.stylesheet.pageTemplates.get(name('page-letter'));
    expect(letter?.header?.center).toEqual([
      { kind: 'text', text: 'Draft ' },
      { kind: 'token', token: 'version', label: 'v?' },
    ]);
    expect(letter?.footer?.left).toEqual([]);
  });

  it('reads the cell style of table styles', () => {
    expect(result.stylesheet.tableStyles.get(name('table'))?.cellStyle).toBe('table-cell');
    expect(result.stylesheet.tableStyles.get(name('table-grid'))?.cellStyle).toBeUndefined();
  });

  it('numbers heading levels 1 to 3 through inheritance', () => {
    const numbered = (style: string) =>
      resolveParagraphStyle(result.stylesheet, name(style))?.paragraph.numbered;
    expect(result.stylesheet.paragraphStyles.get(name('heading-1'))?.paragraph.numbered).toBe(true);
    expect(numbered('heading-3')).toBe(true);
    expect(numbered('heading-4')).toBe(false);
    expect(numbered('heading-6')).toBe(false);
    expect(numbered('body')).toBeUndefined();
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

describe('banded rows of a table style', () => {
  const withBands = (bands: string): string =>
    sheet('tokens:\n  colors:\n    band: "#EEEEEE"').replace(
      '  table: {}',
      `  table:\n    banded-rows:\n${bands}`,
    );

  it('are read as the colors of the odd and the even rows', () => {
    const result = parseStylesheet(withBands("      odd: '#f2f2f2'\n      even: band\n"));
    expect(result.diagnostics).toEqual([]);
    expect(result.stylesheet.tableStyles.get(name('table'))?.bandedRows).toEqual({
      odd: { kind: 'hex', hex: '#F2F2F2' },
      even: { kind: 'token', name: 'band' },
    });
  });

  it('can give one of the two, and are absent when the file gives none', () => {
    const one = parseStylesheet(withBands('      even: band\n'));
    expect(one.stylesheet.tableStyles.get(name('table'))?.bandedRows).toEqual({
      even: { kind: 'token', name: 'band' },
    });
    expect(parseStylesheet(sheet('')).stylesheet.tableStyles.get(name('table'))).not.toHaveProperty(
      'bandedRows',
    );
  });

  it('are reported for an unknown key, a value that is not a color and an unknown token', () => {
    expect(problems(withBands('      third: band\n'))).toEqual([
      ['unknown-property', 'table-styles.table.banded-rows.third'],
    ]);
    expect(problems(withBands('      odd: 12\n'))).toEqual([
      ['invalid-type', 'table-styles.table.banded-rows.odd'],
    ]);
    expect(problems(withBands('      odd: nope\n'))).toEqual([
      ['unknown-token', 'table-styles.table.banded-rows.odd'],
    ]);
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

  it('reads the cover of a page template', () => {
    const result = parseStylesheet(fixture);
    const letter = result.stylesheet.pageTemplates.get(name('page-letter'));
    expect(result.stylesheet.pageTemplates.get(name('page'))?.cover).toBeUndefined();
    expect(letter?.cover?.[0]).toEqual({
      kind: 'paragraph',
      style: 'cover-title',
      text: [{ kind: 'token', token: 'title', label: 'Untitled' }],
    });
    expect(letter?.cover?.[2]).toEqual({
      kind: 'table',
      style: 'table-grid',
      rows: [
        { label: 'Classification', value: [{ kind: 'token', token: 'classification', label: '' }] },
        {
          label: 'Document number',
          value: [{ kind: 'field', name: 'document-number', label: '' }],
        },
        { label: 'Reviewers', value: [{ kind: 'field', name: 'reviewers', label: '' }] },
      ],
    });
  });

  it('reads a cover table with the default table style', () => {
    const source = sheet(
      "page-templates:\n  page:\n    cover:\n      - table:\n          rows:\n            - { label: A, value: 'x [](phrase:authors)' }",
    );
    const { stylesheet, diagnostics } = parseStylesheet(source);
    expect(diagnostics).toEqual([]);
    expect(stylesheet.pageTemplates.get(name('page'))?.cover).toEqual([
      {
        kind: 'table',
        style: 'table',
        rows: [
          {
            label: 'A',
            value: [
              { kind: 'text', text: 'x ' },
              { kind: 'token', token: 'authors', label: '' },
            ],
          },
        ],
      },
    ]);
  });

  it('reports a cover that is wrongly written', () => {
    const cover = (entries: string): string =>
      `page-templates:\n  page:\n    cover:\n${entries
        .split('\n')
        .map((line) => `      ${line}`)
        .join('\n')}`;
    expect(problems(sheet('page-templates:\n  page:\n    cover: text'))).toEqual([
      ['invalid-type', 'page-templates.page.cover'],
    ]);
    expect(problems(sheet(cover("- text: 'a'\n  table: { rows: [] }\n- style: body")))).toEqual([
      ['invalid-value', 'page-templates.page.cover[0]'],
      ['invalid-value', 'page-templates.page.cover[1]'],
    ]);
    expect(problems(sheet(cover("- text: '[](phrase:field:Bad) [](phrase:nope)'")))).toEqual([
      ['unknown-slot-token', 'page-templates.page.cover[0].text'],
      ['unknown-slot-token', 'page-templates.page.cover[0].text'],
    ]);
    expect(
      problems(
        sheet(cover('- table:\n    rows:\n      - { label: A }\n      - { value: B, size: 1 }')),
      ),
    ).toEqual([
      ['invalid-value', 'page-templates.page.cover[0].table.rows[0]'],
      ['unknown-property', 'page-templates.page.cover[0].table.rows[1].size'],
      ['invalid-value', 'page-templates.page.cover[0].table.rows[1]'],
    ]);
  });

  it('reads the table of contents options, with page numbers by default', () => {
    expect(parseStylesheet(sheet('')).stylesheet.tableOfContents).toEqual({ pageNumbers: true });
    const off = parseStylesheet(sheet('table-of-contents:\n  page-numbers: false'));
    expect(off.diagnostics).toEqual([]);
    expect(off.stylesheet.tableOfContents).toEqual({ pageNumbers: false });
    expect(parseStylesheet(sheet('table-of-contents:')).diagnostics).toEqual([]);
  });

  it('reports a table of contents option that is unknown or not a boolean', () => {
    expect(
      problems(sheet('table-of-contents:\n  page-numbers: yes please\n  leader: dots')),
    ).toEqual([
      ['unknown-property', 'table-of-contents.leader'],
      ['invalid-type', 'table-of-contents.page-numbers'],
    ]);
  });

  it('reads a page template with the built-in values for what it leaves out', () => {
    const source = sheet('page-templates:\n  small:\n    margins: { left: 36 }\n  empty: {}');
    const { stylesheet, diagnostics } = parseStylesheet(source);
    expect(diagnostics).toEqual([]);
    expect(stylesheet.pageTemplates.get(name('small'))).toEqual({
      size: 'A4',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 36 },
    });
    expect(stylesheet.pageTemplates.get(name('empty'))?.size).toBe('A4');
  });

  it('reads slot text with tokens, literal brackets and braces, and unknown tokens', () => {
    const source = sheet(
      [
        'page-templates:',
        '  a:',
        '    footer:',
        "      left: 'Section [x](https://example.com) {literal} [y](phrase:nope) [](phrase:pages)'",
        '      center: 3',
        '      middle: x',
      ].join('\n'),
    );
    const { stylesheet, diagnostics } = parseStylesheet(source);
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['unknown-property', 'page-templates.a.footer.middle'],
      ['unknown-slot-token', 'page-templates.a.footer.left'],
      ['invalid-type', 'page-templates.a.footer.center'],
    ]);
    expect(stylesheet.pageTemplates.get(name('a'))?.footer?.left).toEqual([
      {
        kind: 'text',
        text: 'Section [x](https://example.com) {literal} [y](phrase:nope) ',
      },
      { kind: 'token', token: 'pages', label: '' },
    ]);
  });

  it('reports bad page templates', () => {
    const source = sheet(
      [
        'page-templates:',
        '  a:',
        '    size: A3',
        '  b:',
        '    margins: { top: wide, middle: 3 }',
        '    orientation: landscape',
        '  Bad_Name: {}',
      ].join('\n'),
    );
    expect(problems(source)).toEqual([
      ['invalid-value', 'page-templates.a.size'],
      ['unknown-property', 'page-templates.b.orientation'],
      ['unknown-property', 'page-templates.b.margins.middle'],
      ['invalid-type', 'page-templates.b.margins.top'],
      ['invalid-name', 'page-templates.Bad_Name'],
    ]);
  });

  it('reports a numbered property that is not true or false', () => {
    const source = sheet('').replace('  body: {}', '  body:\n    numbered: sometimes');
    expect(problems(source)).toEqual([['invalid-type', 'paragraph-styles.body.numbered']]);
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
