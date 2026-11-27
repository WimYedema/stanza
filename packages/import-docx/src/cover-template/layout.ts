import type { CoverArea, CoverColumnWidth, CoverRowHeight, SlotPart } from '@stanza/core';
import type { Rect } from './shapes.js';
import { round } from './shared.js';

/**
 * Rectangles on a page as a cover grid (ADR 0098): the edges of the rectangles are the lines of
 * the grid, and each rectangle takes the cells inside it. A rectangle in front takes its cells
 * from those behind; a text box without a fill of its own takes the color of what is behind it,
 * and what is left of a colored rectangle becomes areas of that color. Grid areas are rectangles,
 * so what is left of a rectangle with text is its largest rectangle, and the rest is reported.
 */

/** Something on the page: its place, what is in front, and its color or its content or both. */
export interface Placed {
  readonly rect: Rect;
  readonly z: number;
  /** The color token that fills it. */
  readonly fill?: string;
  /** What it shows, for one with text, a picture or a table. */
  readonly area?: CoverArea;
}

export interface LaidOut {
  readonly columns: CoverColumnWidth[];
  readonly rows: CoverRowHeight[];
  readonly areas: string[][];
  readonly area: Record<string, CoverArea>;
}

/** Edges closer than this are one edge, so that shapes that nearly line up share a line. */
const SNAP_PT = 2;

/** The edges along one axis, with the ends of the page, those within `SNAP_PT` made one. */
function edges(values: readonly number[], length: number): number[] {
  const sorted = [...values.map((value) => Math.min(length, Math.max(0, value))), 0, length].sort(
    (a, b) => a - b,
  );
  const kept: number[] = [];
  for (const value of sorted) {
    const last = kept.at(-1);
    if (last !== undefined && value - last < SNAP_PT) {
      // The ends of the page stay where they are.
      if (value === length) kept[kept.length - 1] = length;
      continue;
    }
    kept.push(value);
  }
  return kept;
}

/** The index of the edge nearest to a value. */
const nearest = (list: readonly number[], value: number): number =>
  list.reduce(
    (best, edge, index) =>
      Math.abs(edge - value) < Math.abs((list[best] ?? 0) - value) ? index : best,
    0,
  );

/** The largest rectangle of cells for which `inside` holds, as rows and columns from and to. */
function largest(
  rows: number,
  columns: number,
  inside: (row: number, column: number) => boolean,
): { top: number; left: number; bottom: number; right: number } | undefined {
  let best: { top: number; left: number; bottom: number; right: number } | undefined;
  let bestSize = 0;
  for (let top = 0; top < rows; top += 1) {
    for (let left = 0; left < columns; left += 1) {
      if (!inside(top, left)) continue;
      let right = columns;
      for (let bottom = top; bottom < rows; bottom += 1) {
        let column = left;
        while (column < right && inside(bottom, column)) column += 1;
        right = column;
        if (right === left) break;
        const size = (bottom - top + 1) * (right - left);
        if (size > bestSize) {
          bestSize = size;
          best = { top, left, bottom: bottom + 1, right };
        }
      }
    }
  }
  return best;
}

/** A name for an area with content: the first value it shows, such as `title`, if free. */
function nameOf(area: CoverArea, taken: ReadonlySet<string>): string | undefined {
  for (const entry of area.content) {
    const parts: readonly SlotPart[] =
      entry.kind === 'paragraph' ? entry.text : entry.kind === 'table' ? [] : [];
    for (const part of parts) {
      const name = part.kind === 'token' ? part.token : part.kind === 'field' ? part.name : '';
      if (name !== '' && !taken.has(name)) return name;
    }
    if (entry.kind === 'image' && !taken.has('picture')) return 'picture';
    if (entry.kind === 'table' && !taken.has('table')) return 'table';
  }
  return undefined;
}

export function layOut(
  items: readonly Placed[],
  page: { readonly widthPt: number; readonly heightPt: number },
  report: { readonly approximated: string[] },
): LaidOut {
  const xs = edges(
    items.flatMap(({ rect }) => [rect.x, rect.x + rect.width]),
    page.widthPt,
  );
  const ys = edges(
    items.flatMap(({ rect }) => [rect.y, rect.y + rect.height]),
    page.heightPt,
  );
  const columnCount = xs.length - 1;
  const rowCount = ys.length - 1;
  const cells = <T>(value: T): T[][] =>
    Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => value));
  const owner = cells<number>(-1);
  const fillAt = cells<string | undefined>(undefined);
  const spans = items.map(({ rect }) => ({
    top: nearest(ys, rect.y),
    bottom: nearest(ys, rect.y + rect.height),
    left: nearest(xs, rect.x),
    right: nearest(xs, rect.x + rect.width),
  }));
  const order = items
    .map((_, index) => index)
    .sort((a, b) => (items[a]?.z ?? 0) - (items[b]?.z ?? 0));
  // Behind first: what is in front takes the cells, and a fill covers the fills behind it.
  const fillBelow = new Map<number, (string | undefined)[][]>();
  for (const index of order) {
    const item = items[index];
    const span = spans[index];
    if (item === undefined || span === undefined) continue;
    if (item.area !== undefined) {
      fillBelow.set(
        index,
        fillAt.slice(span.top, span.bottom).map((line) => line.slice(span.left, span.right)),
      );
    }
    for (let row = span.top; row < span.bottom; row += 1) {
      for (let column = span.left; column < span.right; column += 1) {
        const line = fillAt[row];
        const owners = owner[row];
        if (line === undefined || owners === undefined) continue;
        if (item.fill !== undefined) line[column] = item.fill;
        if (item.area !== undefined) owners[column] = index;
      }
    }
  }

  const names = cells<string>('.');
  const area: Record<string, CoverArea> = {};
  const taken = new Set<string>();
  let boxes = 0;
  // The areas with content, in front first: each keeps the largest rectangle of what it took.
  for (const index of [...order].reverse()) {
    const item = items[index];
    if (item?.area === undefined) continue;
    const kept = largest(rowCount, columnCount, (row, column) => owner[row]?.[column] === index);
    if (kept === undefined) {
      report.approximated.push('Something on the cover is hidden behind what is in front of it.');
      continue;
    }
    let lost = false;
    for (const [row, line] of owner.entries()) {
      for (const [column, at] of line.entries()) {
        const inside =
          row >= kept.top && row < kept.bottom && column >= kept.left && column < kept.right;
        if (at === index && !inside) {
          line[column] = -1;
          lost = true;
        }
      }
    }
    if (lost) {
      report.approximated.push(
        'Shapes on the cover overlap, and the one behind keeps its largest rectangle.',
      );
    }
    let name = nameOf(item.area, taken);
    if (name === undefined) {
      boxes += 1;
      name = `box-${String(boxes)}`;
    }
    taken.add(name);
    // Without a color of its own, an area takes the color behind most of it, such as a band with
    // thin lines at its edge.
    const span = spans[index];
    const weight = new Map<string, number>();
    let whole = 0;
    for (let row = kept.top; row < kept.bottom; row += 1) {
      for (let column = kept.left; column < kept.right; column += 1) {
        const size =
          ((ys[row + 1] ?? 0) - (ys[row] ?? 0)) * ((xs[column + 1] ?? 0) - (xs[column] ?? 0));
        whole += size;
        const fill = fillBelow.get(index)?.[row - (span?.top ?? 0)]?.[column - (span?.left ?? 0)];
        if (fill !== undefined) weight.set(fill, (weight.get(fill) ?? 0) + size);
      }
    }
    const [mostFill, most] = [...weight].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
    const flowing = most > whole / 2 ? mostFill : undefined;
    const background =
      item.area.background ??
      (item.fill !== undefined
        ? { kind: 'token' as const, name: item.fill }
        : flowing !== undefined
          ? { kind: 'token' as const, name: flowing }
          : undefined);
    area[name] = { ...item.area, ...(background !== undefined ? { background } : {}) };
    for (let row = kept.top; row < kept.bottom; row += 1) {
      for (let column = kept.left; column < kept.right; column += 1) {
        const line = names[row];
        if (line !== undefined) line[column] = name;
      }
    }
  }

  // What is left of the colors becomes areas of one color each, from the top left.
  let bands = 0;
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const fill = fillAt[row]?.[column];
      if (fill === undefined || names[row]?.[column] !== '.') continue;
      const free = (r: number, c: number): boolean =>
        names[r]?.[c] === '.' && fillAt[r]?.[c] === fill;
      let right = column;
      while (right < columnCount && free(row, right)) right += 1;
      let bottom = row + 1;
      const wholeLine = (r: number): boolean => {
        for (let c = column; c < right; c += 1) if (!free(r, c)) return false;
        return true;
      };
      while (bottom < rowCount && wholeLine(bottom)) bottom += 1;
      bands += 1;
      const name = `band-${String(bands)}`;
      area[name] = { valign: 'top', background: { kind: 'token', name: fill }, content: [] };
      for (let r = row; r < bottom; r += 1) {
        for (let c = column; c < right; c += 1) {
          const line = names[r];
          if (line !== undefined) line[c] = name;
        }
      }
    }
  }

  // Lines of the grid that part nothing are left out.
  let widths = xs.slice(1).map((edge, index) => edge - (xs[index] ?? 0));
  let heights = ys.slice(1).map((edge, index) => edge - (ys[index] ?? 0));
  let grid = names;
  for (let column = widths.length - 1; column > 0; column -= 1) {
    if (grid.every((line) => line[column] === line[column - 1])) {
      widths[column - 1] = (widths[column - 1] ?? 0) + (widths[column] ?? 0);
      widths = widths.filter((_, at) => at !== column);
      grid = grid.map((line) => line.filter((_, at) => at !== column));
    }
  }
  for (let row = heights.length - 1; row > 0; row -= 1) {
    const line = grid[row];
    const above = grid[row - 1];
    if (line !== undefined && above !== undefined && line.every((name, at) => name === above[at])) {
      heights[row - 1] = (heights[row - 1] ?? 0) + (heights[row] ?? 0);
      heights = heights.filter((_, at) => at !== row);
      grid = grid.filter((_, at) => at !== row);
    }
  }

  // The widest column and the highest row take what the others leave, so the grid fits the page.
  const widest = widths.indexOf(Math.max(...widths));
  const highest = heights.indexOf(Math.max(...heights));
  return {
    columns: widths.map((width, index) =>
      index === widest ? { kind: 'share', fr: 1 } : { kind: 'points', pt: round(width) },
    ),
    rows: heights.map((height, index) =>
      index === highest ? { kind: 'share', fr: 1 } : { kind: 'points', pt: round(height) },
    ),
    areas: grid,
    area,
  };
}
