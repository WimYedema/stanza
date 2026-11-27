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
function withGrid(background = false): ReturnType<typeof parseStylesheet>['stylesheet'] {
  const grid = [
    '  page-grid:',
    '    size: A4',
    '    margins: { top: 72, right: 72, bottom: 72, left: 72 }',
    '    cover:',
    '      margins: { top: 36, right: 48, bottom: 48, left: 48 }',
    ...(background ? ['      background-image: assets/back.png'] : []),
    '      columns: [100, 1fr, 1fr]',
    '      rows: [80, 2fr, 1fr]',
    '      areas:',
    '        - side logo  number',
    '        - side title title',
    '        - side .     status',
    '      area:',
    '        side:',
    '          valign: bottom',
    '          background: brand',
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
  ['assets/back.png', { format: 'png' as const, widthPx: 595, heightPx: 842, bytes: logo }],
]);

async function coverXml(background = false): Promise<string> {
  const document = parseDocument(
    '---\nstanza-format: 1\npage-template: "page-grid"\ntitle: "My Doc"\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n# One\n',
  ).document;
  const result = await exportDocx(document, withGrid(background), {
    timestamp: new Date('2026-03-04T05:06:07Z'),
    images,
  });
  expect(result.diagnostics).toEqual([]);
  const xml = strFromU8(
    unzipSync(result.bytes ?? new Uint8Array())['word/document.xml'] ?? new Uint8Array(),
  );
  const cut = xml.indexOf('</w:sectPr>');
  // A background picture is in the paragraph that ends the section, after its properties.
  return background
    ? xml.slice(0, xml.indexOf('</w:p>', cut) + '</w:p>'.length)
    : xml.slice(0, cut);
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

  it('fills an area with the color of its background token (ADR 0093)', async () => {
    const xml = await coverXml();
    const first = (xml.match(/<w:tr>.*?<\/w:tr>/gs) ?? [])[0] ?? '';
    const side = /<w:tc>.*?<\/w:tc>/s.exec(first)?.[0] ?? '';
    expect(side).toContain('<w:shd w:fill="2E75B6" w:color="auto" w:val="clear"/>');
    // The side spans three rows: the cells that continue it below carry the same shading.
    expect(xml.match(/<w:shd w:fill="2E75B6"/g)).toHaveLength(3);
    expect(xml.match(/<w:shd /g)).toHaveLength(3);
  });

  it('makes an image no wider than its area', async () => {
    const xml = await coverXml();
    // The logo asks for 400 pt in an area of 199.65 pt.
    const width = Number(/<wp:extent cx="(\d+)"/.exec(xml)?.[1]);
    expect(width).toBe(Math.round(((3993 / 20) * 96 * 9525) / 72));
  });

  it('puts a background image behind the cover, on the page, in the paragraph that ends it (ADR 0097)', async () => {
    const xml = await coverXml(true);
    const end = xml.slice(xml.lastIndexOf('</w:tbl>'));
    // No paragraph of its own: the table is followed by the paragraph that ends the section.
    expect(end.match(/<w:p>/g)).toHaveLength(1);
    expect(end).toContain('<w:sz w:val="2"/>');
    expect(end).toContain('behindDoc="1"');
    expect(end).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset>');
    expect(end).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset>');
    // A4 in EMU: 595.3 by 841.9 points, 12700 to the point.
    expect(end).toMatch(/<wp:extent cx="75\d{5}" cy="106\d{5}"\/>/);
    expect(end).toContain('<wp:wrapNone/>');
    expect(xml.indexOf('behindDoc="1"')).toBe(xml.lastIndexOf('behindDoc="1"'));
  });
});
