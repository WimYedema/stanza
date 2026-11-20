import {
  normalizeInlines,
  type Block,
  type CellBlock,
  type Paragraph,
  type TableCell,
  type Text,
} from '@stanza/core';
import { BlockWriter, paragraphNumbering } from './block-writer.js';
import type { ImportContext } from './context.js';
import { readParagraph } from './paragraph.js';
import { toggleOf } from './styles.js';
import { childOf, descendantsOf, elementsOf, type XmlElement } from './xml.js';

interface Row {
  readonly header: boolean;
  /** One entry for every column of the grid, so that a merged cell is followed by empty ones. */
  readonly cells: readonly TableCell[];
}

const SPACE: Text = { type: 'text', text: ' ', marks: [] };

/** The text of a table inside a cell, which a cell cannot hold: its paragraphs joined with spaces. */
function nestedText(table: XmlElement, ctx: ImportContext): Paragraph | undefined {
  const pieces: Text[][] = [];
  for (const paragraph of descendantsOf(table, 'p')) {
    const read = readParagraph(paragraph, ctx);
    const inlines = [...read.inlines, ...read.extras.flatMap((extra) => extra.content)];
    if (normalizeInlines(inlines).length > 0) pieces.push(inlines);
  }
  const content = pieces.flatMap((inlines, index) => (index === 0 ? inlines : [SPACE, ...inlines]));
  return content.length === 0 ? undefined : { type: 'paragraph', content };
}

/**
 * The blocks of a cell (ADR 0048): its paragraphs, and the lists that its numbered paragraphs make.
 * A heading style in a cell is a paragraph, and a table in a cell is joined into one paragraph.
 */
function readCell(cell: XmlElement, ctx: ImportContext, place: string): TableCell {
  const writer = new BlockWriter();
  const visit = (container: XmlElement): void => {
    for (const child of elementsOf(container)) {
      if (child.name === 'p') {
        const properties = childOf(child, 'pPr');
        const styleId = childOf(properties, 'pStyle')?.attrs['val'];
        const read = readParagraph(child, ctx);
        const isHeading = ctx.styles.headingLevel(styleId) !== undefined;
        // Double line breaks end paragraphs (ADR 0049).
        const [content, ...rest] = read.parts
          .map((part) => normalizeInlines(part))
          .filter((part) => part.length > 0);
        const numbering = isHeading ? undefined : paragraphNumbering(ctx, properties, styleId);
        if (content !== undefined && numbering !== undefined) {
          let kind = ctx.numbering.kindOf(numbering.numId, numbering.level);
          if (kind === undefined) {
            ctx.report.add('unknown-numbering', place);
            kind = 'bulleted';
          }
          const more = rest.map((part): Paragraph => ({ type: 'paragraph', content: part }));
          writer.addItem(kind, numbering.numId, numbering.level, content, [
            ...more,
            ...read.extras,
          ]);
          continue;
        }
        for (const part of [content, ...rest]) {
          if (part !== undefined) writer.push({ type: 'paragraph', content: part });
        }
        for (const extra of read.extras) writer.push(extra);
      } else if (child.name === 'tbl') {
        ctx.report.add('nested-table', place);
        const joined = nestedText(child, ctx);
        if (joined !== undefined) writer.push(joined);
      } else if (child.name === 'sdt') {
        const inner = childOf(child, 'sdtContent');
        if (inner !== undefined) visit(inner);
      }
    }
  };
  visit(cell);
  // A table of contents in a cell is read as text, so it makes no block of its own.
  ctx.pendingToc = undefined;
  return {
    blocks: writer.blocks.filter(
      (block): block is CellBlock => block.type === 'paragraph' || block.type === 'list',
    ),
  };
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
  const cells: TableCell[] = [];
  for (const cell of elementsOf(row, 'tc')) {
    const cellProperties = childOf(cell, 'tcPr');
    const span = Number(childOf(cellProperties, 'gridSpan')?.attrs['val'] ?? '1') || 1;
    if (span > 1 || childOf(cellProperties, 'vMerge') !== undefined) {
      ctx.report.add('merged-cells', place);
    }
    cells.push(readCell(cell, ctx, place));
    for (let extra = 1; extra < span; extra += 1) cells.push({ blocks: [] });
  }
  return { header: toggleOf(properties, 'tblHeader') === true, cells };
}

/**
 * A table of the document, or the blocks of its cells when it cannot be a table (ADR 0046): the
 * model needs a header row and rows of equal length.
 */
export function importTable(table: XmlElement, ctx: ImportContext): Block[] {
  const place = `table after ${ctx.place()}`;
  const rows = elementsOf(table, 'tr').flatMap((row) => readRow(row, ctx, place) ?? []);
  const first = rows[0];
  const width = first?.cells.length ?? 0;
  const regular = rows.every((row) => row.cells.length === width);
  if (first !== undefined && width > 0 && regular && (first.header || lookHasHeader(table))) {
    return [
      {
        type: 'table',
        header: [...first.cells],
        rows: rows.slice(1).map((row) => [...row.cells]),
      },
    ];
  }
  ctx.report.add('table-flattened', place);
  return rows.flatMap((row) => row.cells.flatMap((cell) => cell.blocks));
}
