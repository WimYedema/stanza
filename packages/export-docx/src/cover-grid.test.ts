import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDocument, parseStylesheet } from '@stanza/format';
import { exportDocx } from './export.js';

const STYLESHEET_TEXT = readFileSync(
  new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');

/** The fixture stylesheet with a template `page-grid` that has a cover grid (ADR 0092). */
function withGrid(): ReturnType<typeof parseStylesheet>['stylesheet'] {
  const grid = [
    '  page-grid:',
    '    size: A4',
    '    margins: { top: 72, right: 72, bottom: 72, left: 72 }',
    '    cover:',
    '      margins: { top: 36, right: 48, bottom: 48, left: 48 }',
    '      columns: [100, 1fr, 1fr]',
    '      rows: [80, 2fr, 1fr]',
    '      areas:',
    '        - side logo  number',
    '        - side title title',
    '        - side .     status',
    '      area:',
    '        side:',
    '          valign: bottom',
    '          content:',
    "            - { style: cover-meta, text: 'Side' }",
    '        logo:',
    '          content:',
    '            - { image: assets/logo.png, width: 400, style: cover-meta }',
    '        title:',
    '          valign: center',
    '          content:',
    "            - { style: cover-title, text: '[Untitled](stanza:title)' }",
    '',
  ].join('\n');
  const at = STYLESHEET_TEXT.indexOf('\ntable-of-contents:');
  const parsed = parseStylesheet(
    `${STYLESHEET_TEXT.slice(0, at)}\n${grid}${STYLESHEET_TEXT.slice(at)}`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.stylesheet;
}

const logo = new Uint8Array(33);
logo.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const images = new Map([
  ['assets/logo.png', { format: 'png' as const, widthPx: 400, heightPx: 100, bytes: logo }],
]);

async function coverXml(): Promise<string> {
  const document = parseDocument(
    '---\nstanza-format: 1\npage-template: "page-grid"\ntitle: "My Doc"\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n# One\n',
  ).document;
  const result = await exportDocx(document, withGrid(), {
    timestamp: new Date('2026-03-04T05:06:07Z'),
    images,
  });
  expect(result.diagnostics).toEqual([]);
  const xml = strFromU8(
    unzipSync(result.bytes ?? new Uint8Array())['word/document.xml'] ?? new Uint8Array(),
  );
  return xml.slice(0, xml.indexOf('</w:sectPr>'));
}

describe('exportDocx cover grid (ADR 0092)', () => {
  it('writes a column for each column, with shares of what the columns in points leave', async () => {
    const xml = await coverXml();
    // 595.3 - 96 = 499.3 pt of cover width: 100 pt, then 199.65 pt twice, rounded to twips.
    expect([...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]))).toEqual([
      2000, 3993, 3993,
    ]);
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="9986"/>');
  });

  it('writes an area as one cell that spans its columns and rows', async () => {
    const xml = await coverXml();
    const rows = xml.match(/<w:tr>.*?<\/w:tr>/gs) ?? [];
    expect(rows).toHaveLength(3);
    const cells = rows.map((row) =>
      (row.match(/<w:tcPr>.*?<\/w:tcPr>/gs) ?? []).map((properties) => {
        const span = /<w:gridSpan w:val="(\d+)"\/>/.exec(properties)?.[1];
        const merge = /<w:vMerge w:val="(\w+)"\/>/.exec(properties)?.[1];
        return [span ?? '1', merge ?? '-'].join(':');
      }),
    );
    expect(cells).toEqual([
      ['1:restart', '1:-', '1:-'],
      ['1:continue', '2:-'],
      ['1:continue', '1:-', '1:-'],
    ]);
    expect(rows[0]).toContain('<w:vAlign w:val="bottom"/>');
    expect(rows[1]).toContain('<w:vAlign w:val="center"/>');
    expect(rows[1]).toContain('>My Doc<');
  });

  it('makes an image no wider than its area', async () => {
    const xml = await coverXml();
    // The logo asks for 400 pt in an area of 199.65 pt.
    const width = Number(/<wp:extent cx="(\d+)"/.exec(xml)?.[1]);
    expect(width).toBe(Math.round(((3993 / 20) * 96 * 9525) / 72));
  });
});
