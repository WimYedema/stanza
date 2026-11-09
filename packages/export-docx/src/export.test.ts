import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  plainCell,
  type Diagnostic,
  type Document,
  type List,
  type Paragraph,
  type TableCell,
  type Text,
} from '@phrase/core';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { exportDocx, type ExportResult } from './export.js';

const STYLESHEET_TEXT = readFileSync(
  new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
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
    settingsXml: text('word/settings.xml'),
    numberingXml: text('word/numbering.xml'),
    relsXml: text('word/_rels/document.xml.rels'),
    part: text,
    names: Object.keys(files),
  };
}

const heading = (text: string): string => `<!-- phrase: #k7m2q9x4zb -->\n# ${text}\n\n`;
const partOf = (result: Awaited<ReturnType<typeof build>>, kind: 'header' | 'footer'): string => {
  const name = result.names.find((n) => new RegExp(`^word/${kind}\\d*\\.xml$`).test(n));
  return name === undefined ? '' : result.part(name);
};
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

  it('writes page-break-before into the style, ahead of the other paragraph properties', async () => {
    const sheet = parseStylesheet(
      STYLESHEET_TEXT.replace('page-break-before: false', 'page-break-before: true').replace(
        'keep-with-next: true',
        'keep-with-next: true\n    page-break-before: true',
      ),
    ).stylesheet;
    const { documentXml, stylesXml } = await build('<!-- phrase: .cover-title -->\nCover\n', sheet);
    expect(documentXml).not.toContain('pageBreakBefore');
    expect(styleXml(stylesXml, 'CoverTitle')).toMatch(/<w:pPr><w:pageBreakBefore\/>/);
    expect(styleXml(stylesXml, 'Heading1')).toMatch(
      /<w:pPr><w:keepNext\/>(?:<w:keepLines\/>)?<w:pageBreakBefore\/>/,
    );
    // Heading2 inherits the break from Heading1 through basedOn, and does not repeat it.
    expect(styleXml(stylesXml, 'Heading2')).not.toContain('pageBreakBefore');
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

  it('protects the document so that a reviewer can only add comments, with no password', async () => {
    const { settingsXml } = await build('Text.\n');
    const protection = '<w:documentProtection w:edit="comments" w:enforcement="1"/>';
    expect(settingsXml.split(protection)).toHaveLength(2);
    // In the schema it comes after the background shape and before the default tab stop.
    expect(settingsXml).toMatch(
      /<w:displayBackgroundShape\/>.*<w:documentProtection.*<w:defaultTabStop/s,
    );
    expect(settingsXml).not.toMatch(/w:(hash|salt|cryptProviderType|algorithmName|spinCount)/i);
  });

  it('protects a document with a cover page in the same way', async () => {
    const { settingsXml } = await build('Text.\n', stylesheet, 'page-template: "page-letter"\n');
    expect(settingsXml).toContain('<w:documentProtection w:edit="comments" w:enforcement="1"/>');
  });

  it('writes the given timestamp into the package', async () => {
    const { coreXml } = await build('Text.\n');
    expect(coreXml).toContain('>2026-03-04T05:06:07.000Z</dcterms:created>');
    expect(coreXml).toContain('>2026-03-04T05:06:07.000Z</dcterms:modified>');
  });

  it('gives identical bytes for the same input, whatever the clock says', async () => {
    const body = `${heading('Title')}A **b** [l](https://example.com) <span class="marker">m</span>.\n\n- one\n  1. two\n\n| a | b |\n| - | - |\n| *c* | d |\n`;
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

const TABLE = '| Name | Description |\n| --- | --- |\n| a | first |\n| b | second |\n';

describe('exportDocx tables', () => {
  it('writes a table with its style, a repeating header row and rows that stay whole', async () => {
    const { documentXml } = await build(TABLE);
    expect(documentXml).toContain('<w:tblStyle w:val="Table"/>');
    expect(documentXml).toMatch(/<w:tblLook [^>]*w:firstRow="true"/);
    expect(documentXml.match(/<w:tr>/g)).toHaveLength(3);
    expect(documentXml.match(/<w:tblHeader\/>/g)).toHaveLength(1);
    expect(documentXml.match(/<w:cantSplit\/>/g)).toHaveLength(3);
    expect(paragraphTexts(documentXml)).toEqual([
      'Name',
      'Description',
      'a',
      'first',
      'b',
      'second',
      '',
    ]);
  });

  it('writes cell text in the cell style of the table style', async () => {
    const { documentXml } = await build(TABLE);
    expect(documentXml.match(/<w:pStyle w:val="TableCell"\/>/g)).toHaveLength(6);
  });

  it('does not repeat the header row when the style says not to', async () => {
    const sheet = parseStylesheet(
      STYLESHEET_TEXT.replace('repeat: true', 'repeat: false'),
    ).stylesheet;
    const { documentXml } = await build(TABLE, sheet);
    expect(documentXml).not.toContain('<w:tblHeader');
  });

  it('writes the table style from the resolved stylesheet', async () => {
    const { stylesXml } = await build(TABLE);
    const table = styleXml(stylesXml, 'Table');
    expect(table).toMatch(/<w:style [^>]*w:type="table"/);
    expect(table).toContain('<w:basedOn w:val="TableNormal"/>');
    // 0.75 pt outside and 0.5 pt between rows, in eighths of a point.
    expect(table).toMatch(/<w:top w:val="single" w:sz="6" w:space="0" w:color="BFBFBF"\/>/);
    expect(table).toMatch(/<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"\/>/);
    expect(table).not.toContain('insideV');
    // 4 pt padding on every side.
    expect(table.match(/w:w="80" w:type="dxa"/g)).toHaveLength(4);
    expect(table).toMatch(
      /<w:tblStylePr w:type="firstRow"><w:rPr><w:b\/><w:bCs\/><\/w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"\/><\/w:tcPr>/,
    );
  });

  it('writes inherited properties into the derived table style and keeps it independent', async () => {
    const { stylesXml, documentXml } = await build(
      '<!-- phrase: .table-grid -->\n| A |\n| --- |\n| b |\n',
    );
    const grid = styleXml(stylesXml, 'TableGrid');
    expect(grid).toContain('insideV');
    expect(grid).toContain('insideH');
    expect(grid).toContain('<w:tblStylePr w:type="firstRow">');
    expect(grid).not.toMatch(/<w:basedOn w:val="Table"\/>/);
    expect(documentXml).toContain('<w:tblStyle w:val="TableGrid"/>');
    // table-grid names no cell style, so it inherits the one of table.
    expect(documentXml).toContain('<w:pStyle w:val="TableCell"/>');
  });

  it('writes relative widths as percentages, and none for an autofit table', async () => {
    const weighted = await build(
      '<!-- phrase: widths="30 70" -->\n| A | B |\n| - | - |\n| 1 | 2 |\n',
    );
    expect(weighted.documentXml.match(/<w:tcW [^>]*w:w="30%"/g)).toHaveLength(2);
    expect(weighted.documentXml.match(/<w:tcW [^>]*w:w="70%"/g)).toHaveLength(2);
    const autofit = await build(TABLE);
    expect(autofit.documentXml).not.toContain('<w:tcW w:type="pct" w:w="');
    for (const { documentXml } of [weighted, autofit]) {
      expect(documentXml).toMatch(/<w:tblW [^>]*w:type="pct"/);
      expect(documentXml).toContain('<w:tblLayout w:type="autofit"/>');
    }
  });

  it('formats marks in header cells against the header text, so a bold header stays bold', async () => {
    const { documentXml, stylesXml } = await build(
      '| **Name** | *Kind* |\n| --- | --- |\n| **x** | y |\n',
    );
    // The header is bold through the table style, so strong adds nothing there, and a character
    // style with a bold would switch the bold off.
    expect(documentXml).toContain('<w:rStyle w:val="TableCellStrong"/>');
    expect(documentXml.match(/<w:rStyle w:val="TableCellStrong"\/>/g)).toHaveLength(1);
    expect(documentXml).toContain('<w:rStyle w:val="TableCellTableHeaderEmphasis"/>');
    expect(styleXml(stylesXml, 'TableCellTableHeaderEmphasis')).toContain('<w:i/>');
  });

  it('puts the ID of a table in a bookmark around the first header cell', async () => {
    const { documentXml } = await build(`<!-- phrase: #k7m2q9x4zb -->\n${TABLE}`);
    expect(documentXml.match(/<w:bookmarkStart /g)).toHaveLength(1);
    expect(documentXml).toMatch(
      /<w:bookmarkStart [^>]*phrase_k7m2q9x4zb[^>]*\/><w:r><w:t[^>]*>Name<\/w:t><\/w:r><w:bookmarkEnd/,
    );
  });

  it('writes a table in a list item indented under the text and narrowed to the margin', async () => {
    const { documentXml } = await build(
      '- one\n\n  | A | B |\n  | --- | --- |\n  | c | d |\n\n  - nested\n\n    | X |\n    | --- |\n    | y |\n',
    );
    const tables = [...documentXml.matchAll(/<w:tblPr>.*?<\/w:tblPr>/g)].map((m) => m[0]);
    expect(tables).toHaveLength(2);
    // 36 pt is 720 twips, and the text is 9026 twips wide: (9026 - 720) / 9026.
    expect(tables[0]).toMatch(/<w:tblInd [^>]*w:w="720"/);
    expect(tables[0]).toMatch(/<w:tblW [^>]*w:w="92.02%"/);
    expect(tables[1]).toMatch(/<w:tblInd [^>]*w:w="1440"/);
    expect(tables[1]).toMatch(/<w:tblW [^>]*w:w="84.05%"/);
  });

  it('separates tables that touch, and ends the document with a paragraph', async () => {
    const { documentXml } = await build(`${TABLE}\n| X |\n| --- |\n| y |\n`);
    expect(documentXml).toMatch(
      /<\/w:tbl><w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><\/w:p><w:tbl>/,
    );
    expect(documentXml).toMatch(
      /<\/w:tbl><w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><\/w:p><w:sectPr>/,
    );
    const text = await build(`${TABLE}\nAfter.\n`);
    expect(text.documentXml).not.toMatch(
      /<\/w:tbl><w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><\/w:p>/,
    );
  });
});

describe('exportDocx pages', () => {
  const page = (documentXml: string): string =>
    /<w:pgSz [^>]*\/><w:pgMar [^>]*\/>/.exec(documentXml)?.[0] ?? '';

  it('writes A4 with 2.54 cm margins without a template', async () => {
    const { documentXml } = await build('Text.\n');
    expect(page(documentXml)).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(page(documentXml)).toMatch(
      /<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/,
    );
  });

  it('writes the page of the template that the document selects', async () => {
    const { documentXml } = await build('Text.\n', stylesheet, 'page-template: "page-letter"\n');
    expect(page(documentXml)).toMatch(/<w:pgSz w:w="12240" w:h="15840"/);
    // 54 pt and 90 pt margins.
    expect(page(documentXml)).toMatch(
      /<w:pgMar w:top="1080" w:right="1800" w:bottom="1080" w:left="1800"/,
    );
  });

  it('uses the template called page when it exists, and the built-in page when not', async () => {
    const letterAsDefault = parseStylesheet(
      STYLESHEET_TEXT.replace('size: A4', 'size: Letter'),
    ).stylesheet;
    expect(page((await build('Text.\n', letterAsDefault)).documentXml)).toMatch(/w:w="12240"/);
    const noTemplates = parseStylesheet(
      STYLESHEET_TEXT.slice(0, STYLESHEET_TEXT.indexOf('page-templates:')),
    ).stylesheet;
    expect(noTemplates.pageTemplates.size).toBe(0);
    expect(page((await build('Text.\n', noTemplates)).documentXml)).toMatch(/w:w="11906"/);
  });

  it('narrows a table in a list item to the text width of the template', async () => {
    const { documentXml } = await build(
      '- one\n\n  | A |\n  | --- |\n  | b |\n',
      stylesheet,
      'page-template: "page-letter"\n',
    );
    // The text is 8640 twips wide on this page, and the item text starts at 720.
    expect(documentXml).toMatch(/<w:tblW [^>]*w:w="91.67%"/);
  });

  it('refuses a template that does not exist', async () => {
    const result = await exportDocx(read('Text.\n', 'page-template: "nope"\n'), stylesheet, {
      timestamp: TIMESTAMP,
    });
    expect(result.bytes).toBeUndefined();
    expect(codes(result.diagnostics)).toEqual(['unknown-page-template']);
  });
});

describe('exportDocx headers and footers', () => {
  it('writes the header and footer of the default template', async () => {
    const result = await build(
      'Text.\n',
      stylesheet,
      'title: "My Doc"\nclassification: "Internal"\n',
    );
    const header = partOf(result, 'header');
    expect(header).toContain('>My Doc<');
    expect(header).toContain('>Internal<');
    expect(header).toContain('<w:pStyle w:val="HeaderFooter"/>');
    // Left, centre and right on one line: a centre tab at half of 9026 twips and a right tab at its edge.
    expect(header).toMatch(
      /<w:tab [^>]*w:val="center"[^>]*w:pos="4513"|<w:tab [^>]*w:pos="4513"[^>]*w:val="center"/,
    );
    expect(header).toMatch(
      /<w:tab [^>]*w:val="right"[^>]*w:pos="9026"|<w:tab [^>]*w:pos="9026"[^>]*w:val="right"/,
    );
    expect(header.match(/<w:tab\/>/g)).toHaveLength(2);
    expect(result.documentXml).toContain('<w:headerReference');
    expect(result.documentXml).toContain('<w:footerReference');
  });

  it('writes page numbers and the section as Word fields, with the label as the result', async () => {
    const footer = partOf(await build('# A\n'), 'footer');
    expect(footer).toMatch(/w:instr="STYLEREF (&quot;|")heading 1(&quot;|")"/);
    expect(footer).toMatch(/<w:fldSimple [^>]*w:instr="PAGE"[^>]*>.*?>1<\/w:t>/);
    expect(footer).toMatch(/<w:fldSimple [^>]*w:instr="NUMPAGES"[^>]*>.*?>1<\/w:t>/);
    expect(footer).toContain('>Page <');
    expect(footer).toContain('> of <');
  });

  it('shows the label of a token that has no value, and no value for an empty label', async () => {
    const result = await build('Text.\n', stylesheet, 'page-template: "page-letter"\n');
    const header = partOf(result, 'header');
    expect(header).toContain('>Draft <');
    // The version has no source yet, so its label shows. The title and classification are missing.
    expect(header).toContain('>v?<');
    expect(header).not.toContain('>Internal<');
    // A 8640 twip text width on Letter with these margins.
    expect(header).toMatch(/w:pos="4320"/);
    expect(header).toMatch(/w:pos="8640"/);
  });

  it('leaves out a slot line that has no tabs when only the left slot is used', async () => {
    const sheetText = STYLESHEET_TEXT.replace(
      "      right: '[](phrase:classification)'\r\n",
      '',
    ).replace("      right: '[](phrase:classification)'\n", '');
    const result = await build('Text.\n', parseStylesheet(sheetText).stylesheet, 'title: "T"\n');
    const header = partOf(result, 'header');
    expect(header).toContain('>T<');
    expect(header).not.toContain('<w:tabs>');
  });

  it('writes no header or footer for a stylesheet without them', async () => {
    const none = parseStylesheet(
      STYLESHEET_TEXT.slice(0, STYLESHEET_TEXT.indexOf('page-templates:')),
    ).stylesheet;
    const result = await build('Text.\n', none);
    expect(result.names.filter((n) => /word\/(header|footer)/.test(n))).toEqual([]);
    expect(result.documentXml).not.toContain('headerReference');
  });
});

describe('exportDocx diagnostics', () => {
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

describe('exportDocx style labels', () => {
  const labelled = (from: string, to: string) =>
    parseStylesheet(STYLESHEET_TEXT.replaceAll('\r\n', '\n').replace(from, to)).stylesheet;
  const nameOf = (xml: string): string | undefined => /<w:name w:val="([^"]*)"/.exec(xml)?.[1];

  it('shows a custom paragraph style in Word by its label, with the ID of its name', async () => {
    const sheet = labelled(
      '  cover-meta:\n    based-on: body',
      "  cover-meta:\n    label: 'Cover details'\n    based-on: body",
    );
    const { stylesXml } = await build('Text.\n', sheet);
    expect(nameOf(styleXml(stylesXml, 'CoverMeta'))).toBe('Cover details');
    expect(stylesXml).not.toContain('w:val="Cover Meta"');
  });

  it('keeps the names that Word gives to the body and the headings, whatever their label', async () => {
    const sheet = labelled(
      '  heading-1:\n    based-on: body',
      "  heading-1:\n    label: 'Section title'\n    based-on: body",
    );
    const { stylesXml } = await build('Text.\n', sheet);
    expect(nameOf(styleXml(stylesXml, 'Heading1'))).toBe('heading 1');
    expect(stylesXml).not.toContain('Section title');
  });

  it('uses the label of a character style, in the styles generated from it as well', async () => {
    const sheet = labelled(
      '  marker:\n    bold: true',
      "  marker:\n    label: 'Status marker'\n    bold: true",
    );
    const { stylesXml } = await build('A <span class="marker">word</span>.\n', sheet);
    expect(nameOf(styleXml(stylesXml, 'Marker'))).toBe('Status marker');
    expect(nameOf(styleXml(stylesXml, 'NormalMarker'))).toBe('Normal Status marker');
  });

  it('uses the label of a table style, escaped', async () => {
    const sheet = labelled(
      '  table-grid:\n    based-on: table',
      "  table-grid:\n    label: 'Grid & lines'\n    based-on: table",
    );
    const { stylesXml } = await build('| A |\n| - |\n| b |\n', sheet);
    expect(nameOf(styleXml(stylesXml, 'TableGrid'))).toBe('Grid &amp; lines');
  });

  it('reports a label that is the Word name of another style', async () => {
    const sheet = labelled(
      '  cover-meta:\n    based-on: body',
      "  cover-meta:\n    label: 'cover TITLE'\n    based-on: body",
    );
    const result = await exportDocx(read('Text.\n'), sheet, { timestamp: TIMESTAMP });
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'style-name-collision',
        path: 'paragraph-styles.cover-meta',
      }),
    ]);
  });
});

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

  it('indents a code block in a list item under the text, in the style of the block', async () => {
    const { documentXml, stylesXml } = await build(
      '- one\n\n  ```\n  first\n  second\n  ```\n\n  - nested\n\n    ```\n    deeper\n    ```\n\n1. numbered\n\n   ```\n   code\n   ```\n',
    );
    expect(documentXml).toContain('<w:pStyle w:val="CodeInListBulleted1"/>');
    expect(documentXml).toContain('<w:pStyle w:val="CodeInListBulleted2"/>');
    expect(documentXml).toContain('<w:pStyle w:val="CodeInListNumbered1"/>');
    const style = styleXml(stylesXml, 'CodeInListBulleted2');
    expect(style).toContain('<w:basedOn w:val="Code"/>');
    expect(style).toMatch(
      /<w:ind w:left="1440" w:hanging="0"\/>|<w:ind w:hanging="0" w:left="1440"\/>/,
    );
    expect(documentXml.match(/<w:br\/>/g)).toHaveLength(1);
  });

  it('writes the marker of an item that starts with a code block or a table', async () => {
    const { documentXml } = await build('- ```\n  code\n  ```\n');
    expect(numbered(documentXml)).toHaveLength(1);
    expect(documentXml).toContain('<w:pStyle w:val="CodeInListBulleted1"/>');
  });

  it('indents a further paragraph with its own style under the text of the item', async () => {
    const { documentXml } = await build('- one\n\n  <!-- phrase: .cover-title -->\n  Title\n');
    expect(documentXml).toContain('<w:pStyle w:val="CoverTitleInListBulleted1"/>');
  });

  it('ends a document that ends with a table in a list item with a paragraph', async () => {
    const { documentXml } = await build('- one\n\n  | A |\n  | --- |\n  | b |\n');
    expect(documentXml).toMatch(
      /<\/w:tbl><w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><\/w:p><w:sectPr>/,
    );
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

describe('exportDocx table of contents', () => {
  const body = (toc: string): string =>
    `${toc}\n\n<!-- phrase: #k7m2q9x4zb -->\n# One\n\n<!-- phrase: #a1b2c3d4e5 -->\n## Two\n\n### Three\n\n`;
  const TOC = '```phrase-toc\ndepth: 2\n```';
  const noPageNumbers = { ...stylesheet, tableOfContents: { pageNumbers: false } };

  it('writes a Word field that Word fills in on opening, with the entries as its cache', async () => {
    const { documentXml, result } = await build(body(TOC));
    expect(codes(result.diagnostics)).toEqual(['missing-id']);
    expect(documentXml).toContain('<w:docPartGallery w:val="Table of Contents"/>');
    expect(documentXml).toContain('TOC \\h \\o &quot;1-2&quot; \\u');
    expect(documentXml).toContain('w:fldCharType="begin" w:dirty="true"');
    expect(documentXml.match(/<w:pStyle w:val="TOC\d"\/>/g)).toEqual([
      '<w:pStyle w:val="TOC1"/>',
      '<w:pStyle w:val="TOC2"/>',
    ]);
    expect(documentXml).toContain('1 One');
    expect(documentXml).toContain('1.1 Two');
    expect(documentXml).not.toContain('Three</w:t><w:tab/>');
  });

  it('links each entry to the bookmark of its heading', async () => {
    const { documentXml } = await build(body(TOC));
    expect(documentXml).toContain('w:anchor="phrase_k7m2q9x4zb"');
    expect(documentXml).toContain('w:anchor="phrase_a1b2c3d4e5"');
    expect(documentXml).toContain('<w:bookmarkStart w:name="phrase_k7m2q9x4zb" w:id="1"/>');
  });

  it('lets Word find the headings by the outline level of their styles', async () => {
    const { stylesXml } = await build(body(TOC));
    const levels = (id: string): string | undefined =>
      new RegExp(`w:styleId="${id}".*?<w:outlineLvl w:val="(\\d)"`, 's').exec(stylesXml)?.[1];
    expect(levels('Heading1')).toBe('0');
    expect(levels('Heading3')).toBe('2');
    expect(stylesXml).toContain('w:styleId="TOC1"');
    expect(/w:styleId="TOC2".*?<\/w:style>/s.exec(stylesXml)?.[0]).toContain(
      '<w:name w:val="toc 2"/>',
    );
  });

  it('reads the depth from the block, and defaults to 3', async () => {
    const { documentXml } = await build(body('```phrase-toc\n```'));
    expect(documentXml).toContain('\\o &quot;1-3&quot;');
    expect(documentXml.match(/<w:pStyle w:val="TOC\d"\/>/g)).toHaveLength(3);
  });

  it('aligns the page numbers at the end of the text of the template', async () => {
    const a4 = await build(body(TOC));
    expect(a4.documentXml).toContain('<w:tab w:val="right" w:pos="9026" w:leader="dot"/>');
    const letter = await build(body(TOC), stylesheet, 'page-template: "page-letter"\n');
    expect(letter.documentXml).toContain('<w:tab w:val="right" w:pos="8640" w:leader="dot"/>');
    expect(letter.documentXml).not.toContain('w:pos="9025"');
    expect(letter.documentXml).not.toContain('w:val="clear"');
  });

  it('writes plain linked entries without a field when page numbers are off', async () => {
    const { documentXml } = await build(body(TOC), noPageNumbers);
    expect(documentXml).not.toContain('TOC \\h');
    expect(documentXml).not.toContain('<w:tab ');
    expect(documentXml).toContain('<w:pStyle w:val="TOC2"/>');
    expect(documentXml).toContain('w:anchor="phrase_a1b2c3d4e5"');
    expect(documentXml).toContain('1.1 Two');
  });

  it('writes an entry without a link when its heading has no ID', async () => {
    const { documentXml, result } = await build(`${TOC}\n\n# One\n\n`, noPageNumbers);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['missing-id']);
    expect(documentXml).toContain('1 One');
    expect(documentXml).not.toContain('w:anchor');
  });

  it('writes nothing for a table of contents without headings', async () => {
    const { documentXml, result } = await build(`${TOC}\n\nText.\n`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['toc-empty']);
    expect(documentXml).not.toContain('Table of Contents');
  });

  it('is deterministic', async () => {
    const first = await build(body(TOC));
    const second = await build(body(TOC));
    expect(second.bytes).toEqual(first.bytes);
  });
});

describe('exportDocx cover page', () => {
  const FRONT =
    'page-template: "page-letter"\ntitle: "My Doc"\nauthors:\n  - "Ann"\n  - "Bob"\nclassification: "Internal"\ndocument-number: "D-1"\nreviewers:\n  - "Cy"\n  - "Di"\n';
  const sections = (xml: string): string[] => xml.match(/<w:sectPr>.*?<\/w:sectPr>/gs) ?? [];
  const body = '<!-- phrase: #k7m2q9x4zb -->\n# One\n\nText.\n';

  it('writes the cover with the metadata filled in, before the body', async () => {
    const { documentXml, result } = await build(body, stylesheet, FRONT);
    expect(result.diagnostics).toEqual([]);
    const cover = documentXml.slice(0, documentXml.indexOf('<w:pStyle w:val="Heading1"/>'));
    expect(cover).toContain('<w:pStyle w:val="CoverTitle"/>');
    expect(cover).toContain('>My Doc<');
    expect(cover).toContain('<w:pStyle w:val="CoverMeta"/>');
    expect(cover).toContain('>Ann, Bob<');
    expect(cover).toContain('<w:tblStyle w:val="TableGrid"/>');
    for (const text of ['Classification', 'Internal', 'Document number', 'D-1', 'Cy, Di']) {
      expect(cover).toContain(`>${text}<`);
    }
  });

  it('ends the cover with a section break, so the body starts on a new page', async () => {
    const { documentXml } = await build(body, stylesheet, FRONT);
    const [first, second, ...rest] = sections(documentXml);
    expect(rest).toEqual([]);
    expect(first).not.toContain('headerReference');
    expect(first).not.toContain('footerReference');
    expect(first).toContain('<w:pgSz w:w="12240" w:h="15840"');
    expect(second).toContain('headerReference');
    expect(second).toContain('footerReference');
    expect(second).toContain('<w:pgSz w:w="12240" w:h="15840"');
  });

  it('starts the numbering of the body at 1, and counts the pages of that section', async () => {
    const result = await build(body, stylesheet, FRONT);
    expect(sections(result.documentXml)[1]).toContain('<w:pgNumType w:start="1"/>');
    expect(sections(result.documentXml)[0]).not.toContain('w:start=');
    expect(partOf(result, 'footer')).toContain('w:instr="SECTIONPAGES"');
    expect(partOf(result, 'footer')).not.toContain('NUMPAGES');
  });

  it('writes a document without a cover as one section that counts all pages', async () => {
    const result = await build(body, stylesheet, 'title: "My Doc"\n');
    expect(sections(result.documentXml)).toHaveLength(1);
    expect(result.documentXml).not.toContain('CoverTitle');
    expect(partOf(result, 'footer')).toContain('w:instr="NUMPAGES"');
    expect(result.documentXml).not.toContain('w:start=');
  });

  it('leaves out a paragraph without text, and a row without a value', async () => {
    const { documentXml } = await build(
      body,
      stylesheet,
      'page-template: "page-letter"\ntitle: "T"\n',
    );
    expect(documentXml).toContain('>T<');
    expect(documentXml).not.toContain('CoverMeta');
    expect(documentXml).not.toContain('Classification');
    expect(documentXml).not.toContain('<w:tblStyle w:val="TableGrid"/>');
  });

  it('shows the label of a missing value, and writes no cover when nothing is left', async () => {
    const withLabels = parseStylesheet(
      STYLESHEET_TEXT.replace("'[](phrase:authors)'", "'by [anyone](phrase:authors)'"),
    ).stylesheet;
    const labelled = await build(body, withLabels, 'page-template: "page-letter"\n');
    expect(labelled.documentXml).toContain('>by anyone<');
    expect(labelled.documentXml).toContain('>Untitled<');
    const emptied = parseStylesheet(
      STYLESHEET_TEXT.replace("'[Untitled](phrase:title)'", "''").replace(
        "'[](phrase:authors)'",
        "''",
      ),
    ).stylesheet;
    const none = await build(body, emptied, 'page-template: "page-letter"\n');
    expect(sections(none.documentXml)).toHaveLength(1);
    expect(none.documentXml).not.toContain('w:start=');
  });

  it('writes the table of a cover without a header row', async () => {
    const { documentXml } = await build(body, stylesheet, FRONT);
    expect(documentXml).toContain('<w:tblLook w:firstRow="false"');
    const table = /<w:tbl>.*?<\/w:tbl>/s.exec(documentXml)?.[0] ?? '';
    expect(table.match(/<w:tr>/g)).toHaveLength(3);
    expect(table).not.toContain('<w:tblHeader');
  });

  it('does not number the cover like the headings of the body', async () => {
    const { documentXml } = await build(body, stylesheet, FRONT);
    expect(documentXml).toMatch(/<w:t xml:space="preserve">1 <\/w:t>/);
    const cover = documentXml.slice(0, documentXml.indexOf('<w:pStyle w:val="Heading1"/>'));
    expect(cover).not.toContain('>1 <');
  });

  it('puts a table of contents after the cover', async () => {
    const { documentXml } = await build(`\`\`\`phrase-toc\n\`\`\`\n\n${body}`, stylesheet, FRONT);
    expect(documentXml.indexOf('Table of Contents')).toBeGreaterThan(
      documentXml.indexOf('</w:sectPr>'),
    );
  });
});

describe('exportDocx cells with blocks', () => {
  const run = (value: string): Text => ({ type: 'text', text: value, marks: [] });
  const paragraph = (value: string): Paragraph => ({ type: 'paragraph', content: [run(value)] });
  const tableOf = (cell: TableCell): Document => ({
    meta: { fields: {} },
    blocks: [{ type: 'table', header: [plainCell([run('H')])], rows: [[cell]] }],
  });
  const exported = async (cell: TableCell) => {
    const result = await exportDocx(tableOf(cell), stylesheet, { timestamp: TIMESTAMP });
    const files = result.bytes === undefined ? {} : unzipSync(result.bytes);
    const xml = strFromU8(files['word/document.xml'] ?? new Uint8Array());
    return { result, xml };
  };

  it('writes each paragraph of a cell in the cell style', async () => {
    const { xml } = await exported({ blocks: [paragraph('first'), paragraph('second')] });
    expect(paragraphTexts(xml).slice(0, 3)).toEqual(['H', 'first', 'second']);
    expect(xml.match(/<w:pStyle w:val="TableCell"\/>/g)).toHaveLength(3);
  });

  it('writes an empty cell as one empty paragraph, since Word wants one', async () => {
    const { xml } = await exported({ blocks: [] });
    expect(paragraphTexts(xml).slice(0, 2)).toEqual(['H', '']);
  });

  it('reports a list in a cell as not supported yet', async () => {
    const list: List = { type: 'list', kind: 'bulleted', items: [{ blocks: [paragraph('a')] }] };
    const { result } = await exported({ blocks: [list] });
    expect(codes(result.diagnostics)).toContain('docx-unsupported-block');
  });
});
