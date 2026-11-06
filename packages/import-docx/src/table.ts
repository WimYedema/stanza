import { normalizeInlines, type Paragraph, type Table, type Text } from '@phrase/core';
import type { ImportContext } from './context.js';
import { readParagraph } from './paragraph.js';
import { toggleOf } from './styles.js';
import { childOf, elementsOf, type XmlElement } from './xml.js';

interface Row {
  readonly header: boolean;
  /** One entry for every column of the grid, so that a merged cell is followed by empty ones. */
  readonly cells: readonly (readonly Text[])[];
}

const SPACE: Text = { type: 'text', text: ' ', marks: [] };

/** The paragraphs of a cell, in order, with those of tables inside it. Returns whether there was one. */
function collectParagraphs(container: XmlElement, found: XmlElement[]): boolean {
  let nested = false;
  for (const child of elementsOf(container)) {
    if (child.name === 'p') {
      found.push(child);
    } else if (child.name === 'tbl') {
      nested = true;
      for (const row of elementsOf(child, 'tr')) {
        for (const cell of elementsOf(row, 'tc')) collectParagraphs(cell, found);
      }
    } else if (child.name === 'sdt') {
      const inner = childOf(child, 'sdtContent');
      if (inner !== undefined) nested = collectParagraphs(inner, found) || nested;
    }
  }
  return nested;
}

/** The text of a cell as one run of inlines: its paragraphs joined with spaces. */
function readCell(cell: XmlElement, ctx: ImportContext, place: string): Text[] {
  const paragraphs: XmlElement[] = [];
  const nested = collectParagraphs(cell, paragraphs);
  const pieces: Text[][] = [];
  for (const paragraph of paragraphs) {
    const read = readParagraph(paragraph, ctx);
    const inlines = [...read.inlines, ...read.extras.flatMap((extra) => extra.content)];
    if (normalizeInlines(inlines).length > 0) pieces.push(inlines);
  }
  if (nested) ctx.report.add('nested-table', place);
  else if (pieces.length > 1) ctx.report.add('cell-joined', place);
  // A table of contents in a cell is read as text, so it makes no block of its own.
  ctx.pendingToc = undefined;
  return pieces.flatMap((inlines, index) => (index === 0 ? inlines : [SPACE, ...inlines]));
}

/** Word marks the first row as a header with a repeating row or with the look of the table. */
function lookHasHeader(table: XmlElement): boolean {
  const look = childOf(childOf(table, 'tblPr'), 'tblLook');
  if (look === undefined) return false;
  const first = look.attrs['firstRow']?.toLowerCase();
  if (first !== undefined) return first === '1' || first === 'true' || first === 'on';
  return (Number.parseInt(look.attrs['val'] ?? '0', 16) & 0x20) !== 0;
}

function readRow(row: XmlElement, ctx: ImportContext, place: string): Row | undefined {
  const properties = childOf(row, 'trPr');
  if (childOf(properties, 'del') !== undefined) {
    ctx.report.add('tracked-changes');
    return undefined;
  }
  const cells: Text[][] = [];
  for (const cell of elementsOf(row, 'tc')) {
    const cellProperties = childOf(cell, 'tcPr');
    const span = Number(childOf(cellProperties, 'gridSpan')?.attrs['val'] ?? '1') || 1;
    if (span > 1 || childOf(cellProperties, 'vMerge') !== undefined) {
      ctx.report.add('merged-cells', place);
    }
    cells.push(readCell(cell, ctx, place));
    for (let extra = 1; extra < span; extra += 1) cells.push([]);
  }
  return { header: toggleOf(properties, 'tblHeader') === true, cells };
}

const isEmpty = (inlines: readonly Text[]): boolean => normalizeInlines(inlines).length === 0;

/**
 * A table of the document, or its cells as paragraphs when it cannot be a table (ADR 0046): the
 * model needs a header row and rows of equal length.
 */
export function importTable(table: XmlElement, ctx: ImportContext): (Table | Paragraph)[] {
  const place = `table after ${ctx.place()}`;
  const rows = elementsOf(table, 'tr').flatMap((row) => readRow(row, ctx, place) ?? []);
  const first = rows[0];
  const width = first?.cells.length ?? 0;
  const regular = rows.every((row) => row.cells.length === width);
  if (first !== undefined && width > 0 && regular && (first.header || lookHasHeader(table))) {
    return [
      {
        type: 'table',
        header: first.cells.map((content) => ({ content })),
        rows: rows.slice(1).map((row) => row.cells.map((content) => ({ content }))),
      },
    ];
  }
  ctx.report.add('table-flattened', place);
  return rows.flatMap((row) =>
    row.cells.filter((cell) => !isEmpty(cell)).map((content) => ({ type: 'paragraph', content })),
  );
}
