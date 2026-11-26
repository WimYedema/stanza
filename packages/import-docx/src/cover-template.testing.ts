import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  FrameAnchorType,
  Header,
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

const cell = (children: Paragraph[], columnSpan?: number): TableCell =>
  new TableCell({ children, ...(columnSpan !== undefined ? { columnSpan } : {}) });

/**
 * A made-up report template, built like a real corporate one: a different first-page header with a
 * logo and an address in a table without borders, a rule, a framed class line, placeholders in
 * square brackets, a table of metadata with borders, and a footer centred with a tab.
 */
export async function reportTemplate(): Promise<Uint8Array> {
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
                  new ImageRun({
                    type: 'png',
                    data: smallPng(),
                    transformation: { width: 64, height: 19 },
                  }),
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
                          children: [
                            new ImageRun({
                              type: 'png',
                              data: smallPng(),
                              transformation: { width: 96, height: 29 },
                            }),
                          ],
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
          new Paragraph({ style: 'doctitle', text: '[Document title]' }),
          new Paragraph({ style: 'base' }),
          new Table({
            columnWidths: [1700, 2400, 1300, 3495],
            rows: [
              new TableRow({
                children: [
                  cell([new Paragraph({ style: 'meta', text: 'Author(s):' })]),
                  cell([new Paragraph({ style: 'meta', text: '[Author name(s)]' })], 3),
                ],
              }),
              new TableRow({
                children: [
                  cell([new Paragraph({ style: 'meta', text: 'Date:' })]),
                  cell([new Paragraph({ style: 'meta', text: '[Date]' })]),
                  cell([new Paragraph({ style: 'meta', text: 'Doc. No:' })]),
                  cell([new Paragraph({ style: 'meta', text: '[Document number]' })]),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ style: 'base', text: 'The body of the report.' }),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
