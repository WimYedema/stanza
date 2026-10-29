import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostic, List, Text } from '@phrase/core';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { exportDocx, type ExportResult } from './export.js';

const STYLESHEET_TEXT = readFileSync(
  new URL('../../../fixtures/stylesheet/default.yaml', import.meta.url),
  'utf8',
);
const stylesheet = parseStylesheet(STYLESHEET_TEXT).stylesheet;

const TIMESTAMP = new Date('2026-03-04T05:06:07Z');
const HEADER = '---\nphrase-format: 1\n---\n\n';

function read(body: string, front = '') {
  const source = front === '' ? HEADER + body : `---\nphrase-format: 1\n${front}---\n\n${body}`;
  const parsed = parseDocument(source);
  expect(parsed.diagnostics).toEqual([]);
  return parsed.document;
}

async function build(body: string, sheet = stylesheet, front = '') {
  const result = await exportDocx(read(body, front), sheet, { timestamp: TIMESTAMP });
  if (result.bytes === undefined) {
    throw new Error(`No package: ${JSON.stringify(result.diagnostics)}`);
  }
  const files = unzipSync(result.bytes);
  const text = (path: string): string => strFromU8(files[path] ?? new Uint8Array());
  return {
    result,
    bytes: result.bytes,
    documentXml: text('word/document.xml'),
    stylesXml: text('word/styles.xml'),
    coreXml: text('docProps/core.xml'),
    numberingXml: text('word/numbering.xml'),
    relsXml: text('word/_rels/document.xml.rels'),
  };
}

const heading = (text: string): string => `<!-- phrase: #k7m2q9x4zb -->\n# ${text}\n\n`;
const codes = (diagnostics: readonly Diagnostic[]): string[] => diagnostics.map((d) => d.code);

afterEach(() => {
  vi.useRealTimers();
});

describe('exportDocx', () => {
  it('writes headings and paragraphs with named styles', async () => {
    const { documentXml, stylesXml, result } = await build(`${heading('Title')}Some text.\n`);
    expect(result.diagnostics).toEqual([]);
    expect(documentXml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(documentXml).toContain('<w:pStyle w:val="Normal"/>');
    expect(documentXml).not.toContain('<w:rPr>');
    expect(stylesXml.match(/w:styleId="Normal"/g)).toHaveLength(1);
    expect(stylesXml).toMatch(
      /<w:style [^>]*w:styleId="Normal"[^>]*w:default="1"|<w:style [^>]*w:default="1"[^>]*w:styleId="Normal"/,
    );
  });

  it('writes every declared style with its own properties and base', async () => {
    const { stylesXml } = await build('Text.\n');
    for (const id of ['Heading2', 'CoverTitle', 'ListNumbered', 'Marker', 'Muted']) {
      expect(stylesXml).toContain(`w:styleId="${id}"`);
    }
    const heading2 = /<w:style [^>]*w:styleId="Heading2".*?<\/w:style>/s.exec(stylesXml)?.[0] ?? '';
    expect(heading2).toContain('<w:basedOn w:val="Heading1"/>');
    expect(heading2).toContain('<w:sz w:val="28"/>');
  });

  it('gives a mark its own character style, holding only the difference', async () => {
    const { documentXml, stylesXml } = await build('A **strong** and *emphasized* word.\n');
    expect(documentXml).toContain('<w:rStyle w:val="NormalStrong"/>');
    expect(documentXml).toContain('<w:rStyle w:val="NormalEmphasis"/>');
    const strong = /<w:style [^>]*w:styleId="NormalStrong".*?<\/w:style>/s.exec(stylesXml)?.[0];
    expect(strong).toContain('<w:b/>');
    expect(strong).not.toContain('<w:i/>');
  });

  it('combines marks into one character style', async () => {
    const { documentXml, stylesXml } = await build('***both***\n');
    expect(documentXml).toContain('<w:rStyle w:val="NormalStrongEmphasis"/>');
    const style = /<w:style [^>]*w:styleId="NormalStrongEmphasis".*?<\/w:style>/s.exec(stylesXml);
    expect(style?.[0]).toContain('<w:b/>');
    expect(style?.[0]).toContain('<w:i/>');
  });

  it('writes no character style when a mark changes nothing', async () => {
    // heading-4 is italic already, so emphasis adds nothing.
    const { documentXml } = await build(
      '<!-- phrase: #k7m2q9x4zb -->\n#### Four with *emphasis*\n',
    );
    expect(documentXml).not.toContain('<w:rStyle');
  });

  it('applies character styles without the toggle problem in a bold heading', async () => {
    const { documentXml, stylesXml } = await build(
      '<!-- phrase: #k7m2q9x4zb -->\n# Heading with <span class="marker">marked</span> text\n',
    );
    expect(documentXml).toContain('<w:rStyle w:val="Heading1Marker"/>');
    const style = /<w:style [^>]*w:styleId="Heading1Marker".*?<\/w:style>/s.exec(stylesXml)?.[0];
    expect(style).toContain('<w:color w:val="2E75B6"/>');
    // heading-1 is bold already, and a bold in the character style would switch it off.
    expect(style).not.toContain('<w:b/>');
  });

  it('writes links as hyperlinks, one for consecutive runs with the same target', async () => {
    const { documentXml, relsXml } = await build(
      'See [the **big** page](https://example.com/x).\n',
    );
    expect(documentXml.match(/<w:hyperlink /g)).toHaveLength(1);
    expect(relsXml).toContain('Target="https://example.com/x"');
    expect(relsXml).not.toMatch(/ Id="(?!rId\d+")/);
    expect(documentXml).toContain('<w:rStyle w:val="NormalLink"/>');
  });

  it('writes code blocks with a line break per line and tabs as tabs', async () => {
    const { documentXml } = await build('```\nfirst\n\tsecond\n```\n');
    expect(documentXml).toContain('<w:pStyle w:val="Code"/>');
    expect(documentXml.match(/<w:br\/>/g)).toHaveLength(1);
    expect(documentXml).toContain('<w:tab/>');
  });

  it('carries page-break-before on paragraphs, which a style cannot hold', async () => {
    const sheet = parseStylesheet(
      STYLESHEET_TEXT.replace('page-break-before: false', 'page-break-before: true'),
    ).stylesheet;
    const { documentXml, stylesXml } = await build('<!-- phrase: .cover-title -->\nCover\n', sheet);
    expect(documentXml).toContain('<w:pageBreakBefore/>');
    expect(stylesXml).not.toContain('<w:pageBreakBefore');
  });

  it('wraps the content of a block that has an ID in a bookmark named after it', async () => {
    const { documentXml } = await build(`${heading('Title')}Text.\n`);
    expect(documentXml).toMatch(
      /<w:p><w:pPr><w:pStyle w:val="Heading1"\/><\/w:pPr><w:bookmarkStart [^>]*w:name="phrase_k7m2q9x4zb"[^>]*w:id="1"[^>]*\/><w:r>.*<\/w:r><w:bookmarkEnd w:id="1"\/><\/w:p>/,
    );
    expect(documentXml.match(/<w:bookmarkStart /g)).toHaveLength(1);
  });

  it('names bookmarks so that they start with a letter, and numbers them in document order', async () => {
    const { documentXml } = await build(
      '<!-- phrase: #0123456789 -->\n# First\n\n<!-- phrase: #a1b2c3d4e5 -->\nA paragraph.\n\n<!-- phrase: #zzzzzzzzzz -->\n## Third\n',
    );
    const starts = [...documentXml.matchAll(/<w:bookmarkStart [^>]*>/g)].map((m) => m[0]);
    expect(starts).toHaveLength(3);
    expect(starts[0]).toContain('w:name="phrase_0123456789"');
    expect(starts[1]).toContain('w:name="phrase_a1b2c3d4e5"');
    expect(starts.map((tag) => /w:id="(\d+)"/.exec(tag)?.[1])).toEqual(['1', '2', '3']);
    expect(documentXml.match(/<w:bookmarkEnd w:id="[123]"\/>/g)).toHaveLength(3);
  });

  it('restarts bookmark numbers in every export', async () => {
    await build(heading('One'));
    const { documentXml } = await build(heading('Two'));
    expect(documentXml).toMatch(/<w:bookmarkStart [^>]*w:id="1"/);
  });

  it('writes no bookmark for a block without an ID', async () => {
    const { documentXml } = await build('Text.\n');
    expect(documentXml).not.toContain('bookmark');
  });

  it('writes the title and authors into the core properties', async () => {
    const { coreXml } = await build(
      'Text.\n',
      stylesheet,
      'title: "A title"\nauthors:\n  - "A"\n  - "B"\n',
    );
    expect(coreXml).toContain('<dc:title>A title</dc:title>');
    expect(coreXml).toContain('<dc:creator>A; B</dc:creator>');
  });

  it('writes the given timestamp into the package', async () => {
    const { coreXml } = await build('Text.\n');
    expect(coreXml).toContain('>2026-03-04T05:06:07.000Z</dcterms:created>');
    expect(coreXml).toContain('>2026-03-04T05:06:07.000Z</dcterms:modified>');
  });

  it('gives identical bytes for the same input, whatever the clock says', async () => {
    const body = `${heading('Title')}A **b** [l](https://example.com) <span class="marker">m</span>.\n\n- one\n  1. two\n`;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const first = await build(body);
    vi.setSystemTime(new Date('2031-06-07T08:09:10Z'));
    const second = await build(body);
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });
});

/** The text of each paragraph, in document order. */
function paragraphTexts(documentXml: string): string[] {
  return [...documentXml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map(([, inner = '']) =>
    [...inner.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''),
  );
}

describe('exportDocx heading numbers', () => {
  it('writes hierarchical numbers as literal text before the heading', async () => {
    const { documentXml } = await build('# A\n\n## B\n\n## C\n\n### D\n\n# E\n');
    expect(paragraphTexts(documentXml)).toEqual(['1 A', '1.1 B', '1.2 C', '1.2.1 D', '2 E']);
    expect(documentXml).not.toContain('<w:fldChar');
  });

  it('numbers only the styles that ask for it', async () => {
    const { documentXml } = await build('# A\n\n#### Deep\n\nText\n');
    expect(paragraphTexts(documentXml)).toEqual(['1 A', 'Deep', 'Text']);
  });

  it('formats the number with the style of the heading, not as a mark', async () => {
    const { documentXml } = await build('# A *b*\n');
    expect(documentXml).toContain('<w:r><w:t xml:space="preserve">1 </w:t></w:r>');
  });

  it('puts the number inside the bookmark of the heading', async () => {
    const { documentXml } = await build(heading('Title'));
    expect(documentXml).toMatch(
      /<w:bookmarkStart [^>]*phrase_k7m2q9x4zb[^>]*\/><w:r><w:t xml:space="preserve">1 <\/w:t><\/w:r>/,
    );
  });

  it('exports a skipped level with the warning', async () => {
    const { documentXml, result } = await build('# A\n\n### C\n');
    expect(paragraphTexts(documentXml)).toEqual(['1 A', '1.0.1 C']);
    expect(codes(result.diagnostics)).toContain('heading-level-skipped');
  });
});

describe('exportDocx diagnostics', () => {
  it('reports blocks it cannot map yet, without producing a package', async () => {
    const document = read('<!-- phrase: #k7m2q9x4zb -->\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    const result = await exportDocx(document, stylesheet, { timestamp: TIMESTAMP });
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'docx-unsupported-block', path: 'blocks[0]' }),
    ]);
  });

  it('refuses a document that does not validate', async () => {
    const result = await exportDocx(read('<!-- phrase: .missing -->\nText.\n'), stylesheet, {
      timestamp: TIMESTAMP,
    });
    expect(result.bytes).toBeUndefined();
    expect(codes(result.diagnostics)).toContain('unknown-style');
  });

  it('refuses a stylesheet that does not validate', async () => {
    const broken = { ...stylesheet, paragraphStyles: new Map() };
    const result = await exportDocx(read('Text.\n'), broken, { timestamp: TIMESTAMP });
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports two style names that become the same Word style', async () => {
    const sheet = parseStylesheet(
      STYLESHEET_TEXT.replace(
        'character-styles:',
        '  heading1:\n    based-on: body\n\ncharacter-styles:',
      ),
    );
    expect(sheet.diagnostics).toEqual([]);
    const result = await exportDocx(read('Text.\n'), sheet.stylesheet, { timestamp: TIMESTAMP });
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'style-id-collision', path: 'paragraph-styles.heading1' }),
    ]);
  });
});

/** The style, level and list of each numbered paragraph, in document order. */
function numbered(documentXml: string): { style: string; level: string; list: string }[] {
  return [
    ...documentXml.matchAll(
      /<w:pStyle w:val="(\w+)"\/><w:numPr><w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>/g,
    ),
  ].map(([, style = '', level = '', list = '']) => ({ style, level, list }));
}

function styleXml(stylesXml: string, id: string): string {
  return new RegExp(`<w:style [^>]*w:styleId="${id}".*?</w:style>`, 's').exec(stylesXml)?.[0] ?? '';
}

describe('exportDocx lists', () => {
  it('writes list items as numbered paragraphs of the list style, nested ones a level deeper', async () => {
    const { documentXml } = await build('- one\n  - nested\n- two\n');
    const items = numbered(documentXml);
    expect(items.map((item) => [item.style, item.level])).toEqual([
      ['ListBulleted', '0'],
      ['ListBulleted', '1'],
      ['ListBulleted', '0'],
    ]);
    expect(new Set(items.map((item) => item.list)).size).toBe(1);
  });

  it('defines markers and indents from the list style, level by level', async () => {
    const { numberingXml } = await build('- one\n  - nested\n\n1. first\n   1. sub\n');
    expect(numberingXml).toContain('<w:lvlText w:val="\u2022"/>');
    expect(numberingXml).toContain('<w:lvlText w:val="\u25E6"/>');
    expect(numberingXml).toContain('<w:numFmt w:val="decimal"/>');
    expect(numberingXml).toContain('<w:numFmt w:val="lowerLetter"/>');
    // 36 pt left indent and an 18 pt hanging indent, one more step for each level.
    expect(numberingXml).toMatch(/<w:ind w:left="720" w:hanging="360"\/>/);
    expect(numberingXml).toMatch(/<w:ind w:left="1440" w:hanging="360"\/>/);
    expect(numberingXml).toMatch(/<w:ind w:left="2160" w:hanging="360"\/>/);
  });

  it('starts every top-level list again, and lets a nested list of another kind count on its own', async () => {
    const { documentXml } = await build('1. a\n   - bullet\n\n1) b\n');
    const [first, nested, second] = numbered(documentXml);
    expect(first?.style).toBe('ListNumbered');
    expect(nested?.style).toBe('ListBulleted');
    expect(second?.style).toBe('ListNumbered');
    expect(new Set([first?.list, nested?.list, second?.list]).size).toBe(3);
  });

  it('indents further paragraphs of an item with a generated style and no marker', async () => {
    const { documentXml, stylesXml } = await build(
      '- one\n\n  more text\n\n  - nested\n\n    deeper\n',
    );
    expect(documentXml).toContain('<w:pStyle w:val="ListBulletedContinue1"/>');
    expect(documentXml).toContain('<w:pStyle w:val="ListBulletedContinue2"/>');
    expect(numbered(documentXml)).toHaveLength(2);
    const style = styleXml(stylesXml, 'ListBulletedContinue2');
    expect(style).toContain('<w:basedOn w:val="ListBulleted"/>');
    expect(style).toMatch(
      /<w:ind w:left="1440" w:hanging="0"\/>|<w:ind w:hanging="0" w:left="1440"\/>/,
    );
  });

  it('writes the marker of an item that starts with a nested list or has no text', async () => {
    const { documentXml } = await build('- - nested\n');
    expect(numbered(documentXml).map((item) => item.level)).toEqual(['0', '1']);
  });

  it('formats marks against the list style', async () => {
    const { documentXml } = await build('- **strong** item\n');
    expect(documentXml).toContain('<w:rStyle w:val="ListBulletedStrong"/>');
  });

  it('puts the ID of a list in a bookmark on its first paragraph only', async () => {
    const { documentXml } = await build('<!-- phrase: #k7m2q9x4zb -->\n- one\n- two\n');
    expect(documentXml.match(/<w:bookmarkStart /g)).toHaveLength(1);
    expect(documentXml).toMatch(/<w:numPr>.*?<\/w:pPr><w:bookmarkStart [^>]*phrase_k7m2q9x4zb/);
  });

  it('reports blocks in list items that it cannot map yet, with the path of the block', async () => {
    const result = await exportDocx(read('- one\n\n  ```\n  code\n  ```\n'), stylesheet, {
      timestamp: TIMESTAMP,
    });
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'docx-unsupported-block',
        path: 'blocks[0].items[0].blocks[1]',
      }),
    ]);
  });

  it('supports the nine levels of Word and reports deeper nesting', async () => {
    const text: Text = { type: 'text', text: 'x', marks: [] };
    const nest = (depth: number): List => ({
      type: 'list',
      kind: 'bulleted',
      items: [
        {
          blocks: [{ type: 'paragraph', content: [text] }, ...(depth > 1 ? [nest(depth - 1)] : [])],
        },
      ],
    });
    const make = (depth: number): Promise<ExportResult> =>
      exportDocx({ meta: { fields: {} }, blocks: [nest(depth)] }, stylesheet, {
        timestamp: TIMESTAMP,
      });
    expect((await make(9)).bytes).toBeDefined();
    const tooDeep = await make(10);
    expect(tooDeep.bytes).toBeUndefined();
    expect(tooDeep.diagnostics).toEqual([
      expect.objectContaining({
        code: 'docx-list-too-deep',
        path: expect.stringContaining('.items[0]') as string,
      }),
    ]);
  });
});
