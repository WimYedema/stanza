// Throwaway spike for backlog item 15. Generates spikes/out/docx-verify.docx and checks its XML.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  AlignmentType,
  Bookmark,
  Document,
  HeadingLevel,
  InternalHyperlink,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import JSZip from 'jszip';

// A table style has no declarative API, so it comes in through externalStyles.
const externalStyles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="table" w:customStyle="1" w:styleId="PhraseTable">
    <w:name w:val="Phrase Table"/>
    <w:basedOn w:val="TableNormal"/>
    <w:uiPriority w:val="59"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:left w:w="100" w:type="dxa"/>
        <w:right w:w="100" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <w:tblStylePr w:type="firstRow">
      <w:rPr><w:b/></w:rPr>
      <w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/></w:tcPr>
    </w:tblStylePr>
  </w:style>
</w:styles>`;

const bookmarkName = (id) => `phrase_${id}`;
const headings = [
  { id: 'k7m2q9x4zb', text: 'Introduction', level: 1 },
  { id: 'a1b2c3d4e5', text: 'Scope', level: 2 },
  { id: '0123456789', text: 'Results', level: 1 },
];

const heading = ({ id, text, level }) =>
  new Paragraph({
    style: `Heading${String(level)}`,
    children: [new Bookmark({ id: bookmarkName(id), children: [new TextRun(text)] })],
  });

const cell = (text, pct) =>
  new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ style: 'TableText', children: [new TextRun(text)] })],
  });

const row = (cells, header) => new TableRow({ tableHeader: header, cantSplit: true, children: cells });

const table = new Table({
  style: 'PhraseTable',
  tableLook: { firstRow: true, noHBand: true, noVBand: true },
  layout: TableLayoutType.AUTOFIT,
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: [2700, 6300],
  rows: [
    row([cell('Name', '30%'), cell('Description', '70%')], true),
    row([cell('a', '30%'), cell('first', '70%')], false),
  ],
});

const doc = new Document({
  externalStyles,
  styles: {
    paragraphStyles: [
      { id: 'TableText', name: 'Table Text', basedOn: 'Normal', run: { size: 20 } },
      { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', run: { bold: true, size: 32 } },
    ],
    characterStyles: [{ id: 'Emphasis2', name: 'Emphasis 2', run: { italics: true } }],
  },
  sections: [
    {
      children: [
        new TableOfContents('Contents', {
          hyperlink: true,
          headingStyleRange: '1-2',
          cachedEntries: headings.map((h) => ({
            title: h.text,
            level: h.level,
            href: bookmarkName(h.id),
          })),
        }),
        ...headings.map(heading),
        table,
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new InternalHyperlink({
              anchor: bookmarkName('k7m2q9x4zb'),
              children: [new TextRun('see introduction')],
            }),
          ],
        }),
      ],
    },
  ],
});

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
const buffer = await Packer.toBuffer(doc);
writeFileSync(new URL('../out/docx-verify.docx', import.meta.url), buffer);

const zip = await JSZip.loadAsync(buffer);
const documentXml = await zip.file('word/document.xml').async('string');
const stylesXml = await zip.file('word/styles.xml').async('string');

// True when some element with this name carries all the given attributes, in any order.
function hasElement(xml, name, attributes) {
  return [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].some(([tag]) =>
    Object.entries(attributes).every(([key, value]) => tag.includes(`${key}="${value}"`)),
  );
}

const checks = [
  ['table style is referenced by id', /<w:tblStyle w:val="PhraseTable"\/>/.test(documentXml)],
  [
    'table style definition is in styles.xml',
    /<w:style [^>]*w:type="table"[^>]*w:styleId="PhraseTable"/.test(stylesXml),
  ],
  [
    'firstRow conditional formatting survives',
    /<w:tblStylePr w:type="firstRow">/.test(stylesXml),
  ],
  ['own paragraph style TableText is defined', /w:styleId="TableText"/.test(stylesXml)],
  [
    'own Heading1 replaces the default (single definition)',
    (stylesXml.match(/w:styleId="Heading1"/g) ?? []).length === 1,
  ],
  ['table width is 100 percent', hasElement(documentXml, 'w:tblW', { 'w:type': 'pct', 'w:w': '5000' })],
  ['autofit layout written', hasElement(documentXml, 'w:tblLayout', { 'w:type': 'autofit' })],
  ['cell widths are relative', hasElement(documentXml, 'w:tcW', { 'w:type': 'pct', 'w:w': '30%' })],
  ['grid has the given columns', /<w:gridCol w:w="2700"\/><w:gridCol w:w="6300"\/>/.test(documentXml)],
  ['header row repeats', /<w:trPr>(?:(?!<\/w:trPr>).)*<w:tblHeader\/>/.test(documentXml)],
  ['table look enables first-row formatting', hasElement(documentXml, 'w:tblLook', { 'w:firstRow': 'true' })],
  ['TOC field instruction', /TOC \\h \\o &quot;1-2&quot;/.test(documentXml)],
  [
    'TOC has cached entries linking to our bookmarks',
    headings.every((h) => documentXml.includes(`w:anchor="${bookmarkName(h.id)}"`)),
  ],
  [
    'TOC cached entry titles',
    headings.every((h) => documentXml.includes(`>${h.text}<`)),
  ],
  [
    'bookmark names are our IDs',
    headings.every((h) =>
      hasElement(documentXml, 'w:bookmarkStart', { 'w:name': bookmarkName(h.id) }),
    ),
  ],
  [
    'bookmark ids are unique',
    (() => {
      const ids = [...documentXml.matchAll(/<w:bookmarkStart [^>]*w:id="(\d+)"/g)].map((m) => m[1]);
      return ids.length > 0 && new Set(ids).size === ids.length;
    })(),
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${String(checks.length - failed)}/${String(checks.length)} passed`);
if (failed > 0) {
  writeFileSync(new URL('../out/docx-verify.document.xml', import.meta.url), documentXml);
  writeFileSync(new URL('../out/docx-verify.styles.xml', import.meta.url), stylesXml);
  console.log('XML dumped to spikes/out/ for inspection');
  process.exitCode = 1;
}
