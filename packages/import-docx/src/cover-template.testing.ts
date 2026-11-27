import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  FrameAnchorType,
  Header,
  HorizontalPositionAlign,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  PositionalTab,
  PositionalTabAlignment,
  PositionalTabLeader,
  PositionalTabRelativeTo,
  SimpleField,
  Tab,
  TabStopType,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  VerticalPositionAlign,
  WidthType,
} from 'docx';
import { strToU8, zipSync } from 'fflate';

/** Helpers for tests of the cover import (ADR 0094). Not part of the package. */

/** The start of a PNG of 160 by 48 pixels: enough for its size to be read. */
export function smallPng(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 160);
  view.setUint32(20, 48);
  return bytes;
}

const ptab = (alignment: (typeof PositionalTabAlignment)[keyof typeof PositionalTabAlignment]) =>
  new PositionalTab({
    alignment,
    relativeTo: PositionalTabRelativeTo.MARGIN,
    leader: PositionalTabLeader.NONE,
  });

/** A frame at an alignment within the margins, as corporate templates place a title or a table. */
const aligned = (y: (typeof VerticalPositionAlign)[keyof typeof VerticalPositionAlign]) => ({
  type: 'alignment' as const,
  alignment: { x: HorizontalPositionAlign.CENTER, y },
  anchor: { horizontal: FrameAnchorType.MARGIN, vertical: FrameAnchorType.MARGIN },
});

/** A paragraph of the metadata table, in the frame at the bottom of the page. */
const bottom = (text: string): Paragraph =>
  new Paragraph({ style: 'meta', text, frame: aligned(VerticalPositionAlign.BOTTOM) });

const cell = (children: Paragraph[], columnSpan?: number): TableCell =>
  new TableCell({ children, ...(columnSpan !== undefined ? { columnSpan } : {}) });

/**
 * A made-up report template, built like a real corporate one: a different first-page header with a
 * logo and an address in a table without borders, a rule, a class line in a frame a quarter down
 * the page, a title in a frame centred on the page, placeholders in square brackets, a table of
 * metadata with borders between two paragraphs of a frame at the bottom, and a footer centred with
 * a tab. The body
 * pages have a header of a logo, the title, the revision and the date, and a footer of page
 * numbers. `logo` is a PNG for the logo; the example `imported-report` was made with one.
 */
export async function reportTemplate(logo: Uint8Array = smallPng()): Promise<Uint8Array> {
  const view = new DataView(logo.buffer, logo.byteOffset, logo.byteLength);
  const image = (width: number) =>
    new ImageRun({
      type: 'png',
      data: logo,
      transformation: {
        width,
        height: Math.round((width * view.getUint32(20)) / view.getUint32(16)),
      },
    });
  const document = new Document({
    styles: {
      paragraphStyles: [
        {
          id: 'base',
          name: 'base',
          run: { font: 'Example Sans', size: 24 },
          paragraph: { spacing: { line: 240, lineRule: 'atLeast' } },
        },
        {
          id: 'rule',
          name: 'rule',
          basedOn: 'base',
          paragraph: {
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '336699', space: 1 } },
          },
        },
        {
          id: 'classline',
          name: 'class line',
          basedOn: 'base',
          run: { bold: true, size: 28 },
          paragraph: { alignment: AlignmentType.CENTER },
        },
        {
          id: 'doctitle',
          name: 'document title',
          basedOn: 'base',
          run: { bold: true, size: 36, color: 'AA3300' },
          paragraph: { alignment: AlignmentType.CENTER },
        },
        {
          id: 'meta',
          name: 'meta',
          basedOn: 'base',
          run: { size: 20 },
        },
        {
          id: 'footline',
          name: 'foot line',
          basedOn: 'base',
          run: { size: 22 },
          paragraph: { alignment: AlignmentType.JUSTIFIED },
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1871, header: 567, footer: 567 },
          },
        },
        headers: {
          // The header of the body pages: a logo, then the title and the revision in the centre
          // and the date at the right, put there with positional tabs, as fields.
          default: new Header({
            children: [
              new Paragraph({
                style: 'meta',
                children: [
                  image(64),
                  new TextRun({ children: [ptab(PositionalTabAlignment.CENTER)] }),
                  new SimpleField('TITLE', 'Old title'),
                  new TextRun(' \u2013 rev. '),
                  new SimpleField('REVNUM', '17'),
                  new TextRun({ children: [ptab(PositionalTabAlignment.RIGHT)] }),
                  new SimpleField('DATE \\@ "dd/MM/yyyy"', '01/02/2026'),
                ],
              }),
              new Paragraph({ style: 'meta' }),
            ],
          }),
          first: new Header({
            children: [
              new Table({
                borders: TableBorders.NONE,
                columnWidths: [4500, 4395],
                width: { size: 8895, type: WidthType.DXA },
                rows: [
                  new TableRow({
                    children: [
                      cell([
                        new Paragraph({
                          style: 'base',
                          children: [image(96)],
                        }),
                      ]),
                      cell([
                        new Paragraph({ style: 'meta', text: 'Example Org' }),
                        new Paragraph({ style: 'meta', text: '1 Main Street' }),
                      ]),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                style: 'meta',
                children: [
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun(' / '),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
          first: new Footer({
            children: [
              new Paragraph({
                style: 'footline',
                tabStops: [
                  { type: TabStopType.LEFT, position: 0 },
                  { type: TabStopType.CENTER, position: 4500 },
                ],
                children: [new TextRun({ children: [new Tab(), 'Restricted use'] })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ style: 'rule' }),
          new Paragraph({
            style: 'classline',
            text: 'Technical report',
            frame: {
              type: 'absolute',
              position: { x: 0, y: 4537 },
              anchor: { horizontal: FrameAnchorType.MARGIN, vertical: FrameAnchorType.PAGE },
            },
          }),
          new Paragraph({ style: 'base' }),
          new Paragraph({
            style: 'doctitle',
            text: '[Document title]',
            frame: aligned(VerticalPositionAlign.CENTER),
          }),
          new Paragraph({ style: 'base' }),
          // The table at the bottom of the page: its paragraphs and those around it share one frame.
          new Paragraph({ style: 'meta', frame: aligned(VerticalPositionAlign.BOTTOM) }),
          new Table({
            columnWidths: [1700, 2400, 1300, 3495],
            rows: [
              new TableRow({
                children: [cell([bottom('Author(s):')]), cell([bottom('[Author name(s)]')], 3)],
              }),
              new TableRow({
                children: [
                  cell([bottom('Date:')]),
                  cell([bottom('[Date]')]),
                  cell([bottom('Doc. No:')]),
                  cell([bottom('[Document number]')]),
                ],
              }),
            ],
          }),
          new Paragraph({ style: 'meta', frame: aligned(VerticalPositionAlign.BOTTOM) }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ style: 'base', text: 'The body of the report.' }),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}

const SHAPE_NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
].join(' ');

/** EMU of a number of points. */
const emu = (pt: number): string => String(Math.round(pt * 12700));

/** A drawing anchored to the page at a place, of a size, with its graphic. */
const anchored = (
  options: { behind: boolean; depth: number; x: string; y: string; width: number; height: number },
  graphic: string,
): string =>
  `<w:r><w:drawing><wp:anchor behindDoc="${options.behind ? '1' : '0'}" relativeHeight="${String(options.depth)}" simplePos="0" locked="0" layoutInCell="1" allowOverlap="1" distT="0" distB="0" distL="0" distR="0">` +
  `<wp:simplePos x="0" y="0"/>${options.x}${options.y}` +
  `<wp:extent cx="${emu(options.width)}" cy="${emu(options.height)}"/><wp:wrapNone/>` +
  `<wp:docPr id="${String(options.depth)}" name="Shape"/><a:graphic><a:graphicData>${graphic}</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;

const atPage = (axis: 'H' | 'V', pt: number): string =>
  `<wp:position${axis} relativeFrom="page"><wp:posOffset>${emu(pt)}</wp:posOffset></wp:position${axis}>`;

/** A text box with one paragraph of text, or of a content control bound to the title. */
const textBox = (inner: string, fill: string, box: string): string =>
  `<wps:wsp><wps:spPr>${box}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</wps:spPr>` +
  `<wps:txbx><w:txbxContent><w:p>${inner}</w:p></w:txbxContent></wps:txbx><wps:bodyPr anchor="ctr"/></wps:wsp>`;

/**
 * A made-up cover of shapes anchored to the page, as the covers of Word's gallery are built
 * (ADR 0098): a picture behind the whole page; a group with a dark band across the top and, on it,
 * a text box without fill that holds the title; a box placed by a percentage of the page, filled
 * with a theme color made darker; and an ellipse, which is left out.
 */
export function shapedTemplate(): Uint8Array {
  const title =
    '<w:sdt><w:sdtPr><w:dataBinding w:xpath="/ns1:coreProperties[1]/ns0:title[1]" w:storeItemID="{6C3C8BC8-F283-45AE-878A-BAB7291924A1}"/></w:sdtPr>' +
    '<w:sdtContent><w:r><w:t>[Document title]</w:t></w:r></w:sdtContent></w:sdt>';
  const picture = anchored(
    { behind: true, depth: 1, x: atPage('H', 0), y: atPage('V', 0), width: 595.3, height: 841.9 },
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="back.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdBack"/></pic:blipFill><pic:spPr/></pic:pic>',
  );
  const group = anchored(
    { behind: true, depth: 2, x: atPage('H', 0), y: atPage('V', 0), width: 595.3, height: 200 },
    '<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></wpg:grpSpPr>' +
      '<wps:wsp><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></wps:spPr><wps:bodyPr/></wps:wsp>' +
      textBox(
        title,
        '<a:noFill/>',
        '<a:xfrm><a:off x="100" y="500"/><a:ext cx="800" cy="300"/></a:xfrm>',
      ) +
      '</wpg:wgp>',
  );
  const percent = anchored(
    {
      behind: false,
      depth: 3,
      x:
        '<mc:AlternateContent><mc:Choice Requires="wp14"><wp:positionH relativeFrom="page"><wp14:pctPosHOffset>50000</wp14:pctPosHOffset></wp:positionH></mc:Choice>' +
        '<mc:Fallback><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH></mc:Fallback></mc:AlternateContent>',
      y: atPage('V', 600),
      width: 200,
      height: 50,
    },
    textBox(
      '<w:r><w:t>Example Org</w:t></w:r>',
      '<a:solidFill><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:solidFill>',
      '',
    ),
  );
  const ellipse = anchored(
    { behind: false, depth: 4, x: atPage('H', 40), y: atPage('V', 700), width: 60, height: 60 },
    '<wps:wsp><wps:spPr><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></wps:spPr><wps:bodyPr/></wps:wsp>',
  );
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${SHAPE_NAMESPACES}><w:body>` +
    `<w:p>${picture}${group}${percent}${ellipse}</w:p>` +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Body.</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/></w:sectPr>' +
    '</w:body></w:document>';
  const theme =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="T"><a:themeElements>' +
    '<a:clrScheme name="T"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
    '<a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme></a:themeElements></a:theme>';
  const relationships =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdBack" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/back.png"/>' +
    '<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
    '</Relationships>';
  return zipSync({
    'word/document.xml': strToU8(document),
    'word/_rels/document.xml.rels': strToU8(relationships),
    'word/theme/theme1.xml': strToU8(theme),
    'word/media/back.png': smallPng(),
  });
}
