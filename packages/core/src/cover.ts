import type { Block, DocumentMeta, Text } from './document.js';
import { slotText } from './slot-values.js';
import { PAGE_SIZES } from './page-template.js';
import {
  EMPTY_AREA,
  coverEntries,
  type Cover,
  type ColorValue,
  type CoverAlignment,
  type CoverColumnWidth,
  type CoverEntry,
  type CoverGrid,
  type CoverImage,
  type CoverRowHeight,
  type PageMargins,
  type PageTemplate,
} from './stylesheet.js';
import { plainCell } from './table-cell.js';

const text = (value: string): Text => ({ type: 'text', text: value, marks: [] });
const cell = (value: string) => plainCell([text(value)]);

/** An entry of a cover with the metadata filled in: a block, or an image. */
export type CoverItem =
  | { readonly kind: 'block'; readonly block: Block }
  | { readonly kind: 'image'; readonly image: CoverImage };

/** A row of a cover with the metadata filled in. A list cover is one row that grows. */
export interface FilledCoverRow {
  readonly height: CoverRowHeight;
  readonly valign: CoverAlignment;
  readonly items: readonly CoverItem[];
}

/**
 * The part of the cover page that the section-ending paragraph needs after the rows, so that rows
 * that fill the page do not push it to a page of its own (ADR 0089).
 */
export const COVER_END_RESERVE_PT = 2;

/**
 * An entry with the metadata filled in, or nothing when it is empty. A paragraph without text and
 * a row without a value are left out, and so is a table without rows. A cover table has no header
 * row. An image is never empty.
 */
function fillEntry(entry: CoverEntry, meta: DocumentMeta): CoverItem | undefined {
  if (entry.kind === 'image') return { kind: 'image', image: entry };
  if (entry.kind === 'paragraph') {
    const content = slotText(entry.text, meta);
    if (content === '') return undefined;
    return {
      kind: 'block',
      block: {
        type: 'paragraph',
        ...(entry.style !== undefined ? { style: entry.style } : {}),
        content: [text(content)],
      },
    };
  }
  const rows = entry.rows.flatMap((row) => {
    const value = slotText(row.value, meta);
    return value === '' ? [] : [[cell(row.label), cell(value)]];
  });
  return rows.length === 0
    ? undefined
    : { kind: 'block', block: { type: 'table', style: entry.style, header: [], rows } };
}

/** The entries with the metadata filled in, in order, without the empty ones. */
export const fillEntries = (entries: readonly CoverEntry[], meta: DocumentMeta): CoverItem[] =>
  entries.flatMap((entry) => {
    const item = fillEntry(entry, meta);
    return item === undefined ? [] : [item];
  });

/**
 * The entries of a list cover with the metadata filled in, as one row that grows, or undefined when
 * no entry is left, so that the cover is not written.
 */
export function fillCover(cover: Cover, meta: DocumentMeta): readonly FilledCoverRow[] | undefined {
  const entries = coverEntries(cover);
  const items = fillEntries(entries, meta);
  return items.length > 0 ? [{ height: { kind: 'auto' }, valign: 'top', items }] : undefined;
}

/** An area of a grid where it is: the row and column of its top left cell, and its spans. */
export interface PlacedArea {
  readonly name: string;
  readonly row: number;
  readonly column: number;
  readonly rowSpan: number;
  readonly columnSpan: number;
}

/** The areas of a grid in the order of their top left cells, and what is wrong with its shape. */
export interface GridShape {
  readonly areas: readonly PlacedArea[];
  readonly problems: readonly string[];
}

/**
 * Where the areas of a grid are (ADR 0092). Each line must have a name for each column, and the
 * cells of a name must form a rectangle; `.` is a cell of no area.
 */
export function placeAreas(areas: readonly (readonly string[])[], columns: number): GridShape {
  const problems: string[] = [];
  const cells = new Map<string, { row: number; column: number }[]>();
  areas.forEach((line, row) => {
    if (line.length !== columns) {
      problems.push(
        `Row ${String(row + 1)} has ${String(line.length)} names for ${String(columns)} columns.`,
      );
    }
    line.forEach((name, column) => {
      if (name === EMPTY_AREA) return;
      const list = cells.get(name) ?? [];
      list.push({ row, column });
      cells.set(name, list);
    });
  });
  const placed: PlacedArea[] = [];
  for (const [name, list] of cells) {
    const rows = list.map((cell) => cell.row);
    const columnsOf = list.map((cell) => cell.column);
    const row = Math.min(...rows);
    const column = Math.min(...columnsOf);
    const rowSpan = Math.max(...rows) - row + 1;
    const columnSpan = Math.max(...columnsOf) - column + 1;
    const filled = list.length === rowSpan * columnSpan;
    if (!filled) problems.push(`The area "${name}" is not a rectangle.`);
    else placed.push({ name, row, column, rowSpan, columnSpan });
  }
  placed.sort((a, b) => a.row - b.row || a.column - b.column);
  return { areas: placed, problems };
}

/**
 * A cover of rows as a grid of one column with an area for each row (ADR 0092), so that rows and
 * grids are written and drawn the same way. A grid is itself.
 */
export function coverGrid(cover: Cover & { readonly kind: 'rows' | 'grid' }): CoverGrid {
  if (cover.kind === 'grid') return cover;
  const name = (index: number): string => `row-${String(index + 1)}`;
  return {
    kind: 'grid',
    ...(cover.margins !== undefined ? { margins: cover.margins } : {}),
    columns: [{ kind: 'share', fr: 1 }],
    rows: cover.rows.map((row) => row.height),
    areas: cover.rows.map((_, index) => [name(index)]),
    area: Object.fromEntries(
      cover.rows.map((row, index) => [
        name(index),
        {
          valign: row.valign,
          ...(row.background !== undefined ? { background: row.background } : {}),
          content: row.content,
        },
      ]),
    ),
  };
}

/** An area of a grid with the metadata of its entries filled in. */
export interface FilledArea extends PlacedArea {
  readonly valign: CoverAlignment;
  readonly background?: ColorValue;
  readonly items: readonly CoverItem[];
}

/**
 * The areas of a grid with the metadata filled in, or undefined when no entry is left, so that the
 * cover is not written. Empty areas stay, since they hold their place.
 */
export function fillGrid(grid: CoverGrid, meta: DocumentMeta): readonly FilledArea[] | undefined {
  const areas = placeAreas(grid.areas, grid.columns.length).areas.map((placed) => {
    const area = grid.area[placed.name];
    return {
      ...placed,
      valign: area?.valign ?? 'top',
      ...(area?.background !== undefined ? { background: area.background } : {}),
      items: area === undefined ? [] : fillEntries(area.content, meta),
    };
  });
  return areas.some((area) => area.items.length > 0) ? areas : undefined;
}

/**
 * The width of each column in points: those in points as they are, and shares of what they leave of
 * the width of the cover page. Nothing is left for shares when the columns in points take it all.
 */
export function coverColumnWidthsPt(
  columns: readonly CoverColumnWidth[],
  areaWidthPt: number,
): number[] {
  const fixed = columns.reduce(
    (sum, column) => sum + (column.kind === 'points' ? column.pt : 0),
    0,
  );
  const shares = columns.reduce(
    (sum, column) => sum + (column.kind === 'share' ? column.fr : 0),
    0,
  );
  const left = Math.max(0, areaWidthPt - fixed);
  return columns.map((column) =>
    column.kind === 'points' ? column.pt : shares > 0 ? (left * column.fr) / shares : 0,
  );
}

/** The blocks of a cover page, with the metadata filled in, in order, without its images. */
export function coverBlocks(cover: Cover | undefined, meta: DocumentMeta): Block[] {
  if (cover === undefined) return [];
  return blocksOf(fillEntries(coverEntries(cover), meta));
}

const blocksOf = (items: readonly CoverItem[]): Block[] =>
  items.flatMap((item) => (item.kind === 'block' ? [item.block] : []));

/**
 * The blocks of a title block (ADR 0090), with the metadata filled in, in order. Images are left
 * out, as for a cover in the editor.
 */
export function titleBlockBlocks(
  entries: readonly CoverEntry[] | undefined,
  meta: DocumentMeta,
): Block[] {
  return entries === undefined ? [] : blocksOf(fillEntries(entries, meta));
}

/** The margins of the cover page: its own, and the template's for the sides it leaves out. */
export function coverMargins(template: PageTemplate): PageMargins {
  const cover = template.cover;
  const own = cover === undefined || cover.kind === 'list' ? undefined : cover.margins;
  return { ...template.margins, ...own };
}

/** The height of the cover page between its margins, in points. */
export function coverAreaHeightPt(template: PageTemplate): number {
  const margins = coverMargins(template);
  return PAGE_SIZES[template.size].heightPt - margins.topPt - margins.bottomPt;
}

/** The width of the cover page between its margins, in points. */
export function coverAreaWidthPt(template: PageTemplate): number {
  const margins = coverMargins(template);
  return PAGE_SIZES[template.size].widthPt - margins.leftPt - margins.rightPt;
}

/**
 * The height of each row in points, or undefined for a row that grows with its content. Shares
 * divide what the rows in points leave of the cover page, less the reserve for the paragraph that
 * ends the section. Nothing is left for shares when the rows in points take it all.
 */
export function coverRowHeightsPt(
  heights: readonly CoverRowHeight[],
  areaHeightPt: number,
): (number | undefined)[] {
  const fixed = heights.reduce(
    (sum, height) => sum + (height.kind === 'points' ? height.pt : 0),
    0,
  );
  const shares = heights.reduce(
    (sum, height) => sum + (height.kind === 'share' ? height.fr : 0),
    0,
  );
  const left = Math.max(0, areaHeightPt - COVER_END_RESERVE_PT - fixed);
  return heights.map((height) => {
    if (height.kind === 'points') return height.pt;
    if (height.kind === 'share') return shares > 0 ? (left * height.fr) / shares : 0;
    return undefined;
  });
}
