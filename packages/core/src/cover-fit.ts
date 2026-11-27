import {
  coverAreaHeightPt,
  coverAreaWidthPt,
  coverColumnWidthsPt,
  coverGrid,
  coverRowHeightsPt,
  placeAreas,
} from './cover.js';
import type { DocumentMeta } from './document.js';
import { resolveParagraphStyle, resolveTableStyle } from './style-resolution.js';
import { slotText, slotValue } from './slot-values.js';
import { BODY_STYLE } from './default-styles.js';
import type { StyleName } from './style-name.js';
import type { CoverEntry, PageTemplate, SlotPart, Stylesheet } from './stylesheet.js';

/**
 * An estimate of whether the text of each area of a cover fits its height, with the values of a
 * document (item 231). Word cuts off what does not fit a row of fixed height without a sign, so a
 * long abstract would lose its end. Word does not say where lines break, so the width of a
 * character is taken as half the font size: the estimate warns only when the text is clearly too
 * long.
 */

/** The width of an average character, as a share of the font size. */
const CHARACTER_EM = 0.5;

/** How much more than its height an area's text may need before a warning: estimates are rough. */
const TOLERANCE = 1.1;

export interface CoverOverflow {
  /** The name of the area of the cover grid. */
  readonly area: string;
  readonly neededPt: number;
  readonly availablePt: number;
  /** The metadata field or token whose value is the longest text in the area, if any. */
  readonly field?: string;
}

/** The lines of text in a width, at a font size: each line of the text wraps on its own. */
function lineCount(text: string, widthPt: number, sizePt: number): number {
  if (widthPt <= 0) return 1;
  const perLine = Math.max(1, Math.floor(widthPt / (sizePt * CHARACTER_EM)));
  return text
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

/** The size, line height and spacing of a paragraph style, with Word's single spacing as default. */
function metrics(
  stylesheet: Stylesheet,
  style: StyleName | undefined,
): { size: number; line: number; around: number } {
  const resolved = resolveParagraphStyle(stylesheet, style ?? BODY_STYLE);
  const size = resolved?.text.sizePt ?? 11;
  const spacing = resolved?.paragraph.lineSpacing;
  const single = size * 1.2;
  const line =
    spacing === undefined
      ? single
      : spacing.rule === 'multiple'
        ? single * spacing.factor
        : spacing.rule === 'exactly'
          ? spacing.pt
          : Math.max(spacing.pt, single);
  const around = (resolved?.paragraph.spaceBeforePt ?? 0) + (resolved?.paragraph.spaceAfterPt ?? 0);
  return { size, line, around };
}

/** The height the entries need in a width, in points; an image is left to the image checks. */
function neededHeight(
  entries: readonly CoverEntry[],
  widthPt: number,
  meta: DocumentMeta,
  stylesheet: Stylesheet,
): number {
  let height = 0;
  for (const entry of entries) {
    if (entry.kind === 'paragraph') {
      const text = slotText(entry.text, meta);
      if (text === '') continue;
      const { size, line, around } = metrics(stylesheet, entry.style);
      height += lineCount(text, widthPt, size) * line + around;
    } else if (entry.kind === 'table') {
      const table = resolveTableStyle(stylesheet, entry.style);
      const { size, line } = metrics(stylesheet, table?.cellStyle);
      const padding = table?.cellPaddingPt ?? 0;
      // A cover table has two columns of the same width.
      const cell = widthPt / 2 - 2 * padding;
      for (const row of entry.rows) {
        const value = slotText(row.value, meta);
        if (value === '') continue;
        const lines = Math.max(lineCount(row.label, cell, size), lineCount(value, cell, size));
        height += lines * line + 2 * padding;
      }
    }
  }
  return height;
}

/** The field or token of the longest value in the entries, which is what a person would shorten. */
function longestField(entries: readonly CoverEntry[], meta: DocumentMeta): string | undefined {
  let best: { name: string; length: number } | undefined;
  const visit = (parts: readonly SlotPart[]): void => {
    for (const part of parts) {
      if (part.kind === 'text') continue;
      const length = slotValue(part, meta)?.length ?? 0;
      const name = part.kind === 'field' ? part.name : part.token;
      if (length > (best?.length ?? 0)) best = { name, length };
    }
  };
  for (const entry of entries) {
    if (entry.kind === 'paragraph') visit(entry.text);
    if (entry.kind === 'table') for (const row of entry.rows) visit(row.value);
  }
  return best?.name;
}

/** The areas of a cover whose text, with the values of a document, needs more than their height. */
export function coverOverflows(
  template: PageTemplate,
  meta: DocumentMeta,
  stylesheet: Stylesheet,
): CoverOverflow[] {
  const cover = template.cover;
  if (cover === undefined || cover.kind === 'list') return [];
  const grid = coverGrid(cover);
  const widths = coverColumnWidthsPt(grid.columns, coverAreaWidthPt(template));
  const heights = coverRowHeightsPt(grid.rows, coverAreaHeightPt(template));
  const overflows: CoverOverflow[] = [];
  for (const placed of placeAreas(grid.areas, grid.columns.length).areas) {
    const spanned = heights.slice(placed.row, placed.row + placed.rowSpan);
    // A row that grows makes room for its text.
    if (spanned.some((height) => height === undefined)) continue;
    const availablePt = spanned.reduce<number>((sum, height) => sum + (height ?? 0), 0);
    const widthPt = widths
      .slice(placed.column, placed.column + placed.columnSpan)
      .reduce((sum, width) => sum + width, 0);
    const entries = grid.area[placed.name]?.content ?? [];
    const neededPt = neededHeight(entries, widthPt, meta, stylesheet);
    if (neededPt <= availablePt * TOLERANCE) continue;
    const field = longestField(entries, meta);
    overflows.push({
      area: placed.name,
      neededPt: Math.round(neededPt),
      availablePt: Math.round(availablePt),
      ...(field !== undefined ? { field } : {}),
    });
  }
  return overflows;
}
