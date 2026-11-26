import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDocument, parseStylesheet } from '@stanza/format';
import { exportDocx } from './export.js';

const STYLESHEET_TEXT = readFileSync(
  new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');

/** The fixture stylesheet with the `page` template's header and footer replaced. */
function withBands(header: string, footer: string) {
  const at = STYLESHEET_TEXT.indexOf('\n  page:\n');
  const end = STYLESHEET_TEXT.indexOf('\n  page-letter:\n');
  const page = [
    '  page:',
    '    size: A4',
    '    margins: { top: 72, right: 72, bottom: 72, left: 72 }',
    header,
    footer,
  ].join('\n');
  const parsed = parseStylesheet(
    `${STYLESHEET_TEXT.slice(0, at)}\n${page}${STYLESHEET_TEXT.slice(end)}`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.stylesheet;
}

const HEADER = [
  '    header:',
  '      distance: 20',
  '      style: header-footer',
  '      columns: [80, 1fr]',
  '      areas:',
  '        - logo text',
  '      area:',
  '        logo:',
  '          content:',
  '            - { image: assets/logo.png, width: 60 }',
  '        text:',
  '          valign: center',
  '          content:',
  "            - { text: '[](stanza:title)' }",
  "            - { style: cover-meta, text: 'Page [1](stanza:page) of [1](stanza:pages)' }",
].join('\n');
const FOOTER = [
  '    footer:',
  '      distance: 14',
  "      left: '[](stanza:classification)'",
].join('\n');

const logo = new Uint8Array(33);
logo.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const images = new Map([
  ['assets/logo.png', { format: 'png' as const, widthPx: 160, heightPx: 48, bytes: logo }],
]);

async function exported(header = HEADER, footer = FOOTER) {
  const document = parseDocument(
    '---\nstanza-format: 1\ntitle: "My Doc"\nclassification: "Internal"\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n# One\n',
  ).document;
  const result = await exportDocx(document, withBands(header, footer), {
    timestamp: new Date('2026-03-04T05:06:07Z'),
    images,
  });
  expect(result.diagnostics).toEqual([]);
  const files = unzipSync(result.bytes ?? new Uint8Array());
  const part = (prefix: string): string => {
    const name = Object.keys(files).find((file) =>
      new RegExp(`^word/${prefix}\\d*\\.xml$`).test(file),
    );
    return name === undefined ? '' : strFromU8(files[name] ?? new Uint8Array());
  };
  return {
    bytes: result.bytes,
    header: part('header'),
    footer: part('footer'),
    document: strFromU8(files['word/document.xml'] ?? new Uint8Array()),
  };
}

describe('exportDocx header and footer (ADR 0095)', () => {
  it('writes a grid header as a borderless table, with its picture and its page fields', async () => {
    const { header } = await exported();
    expect(header).toContain('<w:tbl>');
    expect(header).toContain('<w:gridCol w:w="1600"/>');
    expect(header).toContain('w:instr="PAGE"');
    expect(header).toContain('w:instr="NUMPAGES"');
    expect(header).toContain('>My Doc<');
    expect(header).toContain('<wp:docPr id="1" name="logo.png"><a:extLst');
    // Word ends a header with a paragraph; after the table it is one line of 1 pt.
    const end = /<\/w:tbl>(<w:p>.*?<\/w:p>)<\/w:hdr>/s.exec(header)?.[1] ?? '';
    expect(end).toContain('w:line="20"');
    expect(end).toContain('w:lineRule="exact"');
    expect(end).toContain('<w:sz w:val="2"/>');
  });

  it('puts the header and the footer at their distances from the edge', async () => {
    const { document } = await exported();
    expect(document).toContain('w:header="400" w:footer="280"');
  });

  it('gives the same bytes each time, with the drawings of the header numbered', async () => {
    const first = await exported();
    const second = await exported();
    expect(second.bytes).toEqual(first.bytes);
  });

  it('writes no header when nothing in its grid has content', async () => {
    const empty = [
      '    header:',
      '      areas:',
      '        - text',
      '      area:',
      "        text: { content: [{ text: '[](stanza:field:nothing)' }] }",
    ].join('\n');
    const { header, document } = await exported(empty);
    expect(header).toBe('');
    expect(document).not.toContain('<w:headerReference');
    expect(document).toContain('<w:footerReference');
  });
});
