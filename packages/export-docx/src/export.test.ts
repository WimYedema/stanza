import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '@phrase/core';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { exportDocx } from './export.js';

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
    const body = `${heading('Title')}A **b** [l](https://example.com) <span class="marker">m</span>.\n`;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const first = await build(body);
    vi.setSystemTime(new Date('2031-06-07T08:09:10Z'));
    const second = await build(body);
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });
});

describe('exportDocx diagnostics', () => {
  it('reports blocks it cannot map yet, without producing a package', async () => {
    const document = read('* one\n* two\n');
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
