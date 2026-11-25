import type { Block, DocumentMeta, Text } from './document.js';
import { slotText } from './slot-values.js';
import { PAGE_SIZES } from './page-template.js';
import {
  coverEntries,
  type Cover,
  type CoverAlignment,
  type CoverEntry,
  type CoverImage,
  type CoverLayoutRow,
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

const fill = (entries: readonly CoverEntry[], meta: DocumentMeta): CoverItem[] =>
  entries.flatMap((entry) => {
    const item = fillEntry(entry, meta);
    return item === undefined ? [] : [item];
  });

/**
 * The rows of a cover with the metadata filled in, or undefined when no entry is left, so that
 * the cover is not written. Rows that are empty stay, since they hold the place of the rows below.
 */
export function fillCover(cover: Cover, meta: DocumentMeta): readonly FilledCoverRow[] | undefined {
  const rows: readonly CoverLayoutRow[] =
    cover.kind === 'list'
      ? [{ height: { kind: 'auto' }, valign: 'top', content: cover.entries }]
      : cover.rows;
  const filled = rows.map((row) => ({
    height: row.height,
    valign: row.valign,
    items: fill(row.content, meta),
  }));
  return filled.some((row) => row.items.length > 0) ? filled : undefined;
}

/**
 * The blocks of a cover page, with the metadata filled in, in order. Images are left out: this is
 * what the editor shows of a cover until it draws the rows (item 222).
 */
export function coverBlocks(cover: Cover | undefined, meta: DocumentMeta): Block[] {
  if (cover === undefined) return [];
  return fill(coverEntries(cover), meta).flatMap((item) =>
    item.kind === 'block' ? [item.block] : [],
  );
}

/** The margins of the cover page: its own, and the template's for the sides it leaves out. */
export function coverMargins(template: PageTemplate): PageMargins {
  const own = template.cover?.kind === 'rows' ? template.cover.margins : undefined;
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
