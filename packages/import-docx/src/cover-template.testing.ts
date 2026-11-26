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
