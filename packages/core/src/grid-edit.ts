import { placeAreas } from './cover.js';
import {
  EMPTY_AREA,
  type CoverArea,
  type CoverColumnWidth,
  type CoverEntry,
  type CoverGrid,
  type CoverLayoutRow,
  type CoverRowHeight,
  type HeaderFooter,
} from './stylesheet.js';

/**
 * The changes that the style editor makes to a grid (ADR 0096): columns and rows added and
 * removed, cells given to an area or cleared, and areas renamed. Each gives a new grid, or the
 * reason why it cannot, so that the panel only writes grids that `placeAreas` accepts.
 */

/** A rectangle of cells, from 0. */
export interface CellRange {
  readonly row: number;
  readonly column: number;
  readonly rowSpan: number;
  readonly columnSpan: number;
}

export type GridEdit =
  | { readonly ok: true; readonly grid: CoverGrid }
  | { readonly ok: false; readonly message: string };

/** An area name is kebab-case, as a style name; `.` is a cell of no area. */
const AREA_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Whether a text can name an area, or with `.` a cell of no area. */
export const isAreaName = (name: string): boolean => name === EMPTY_AREA || AREA_NAME.test(name);

const EMPTY: CoverArea = { valign: 'top', content: [] };

/** The names of the areas in the order in which they first appear, row by row. */
export function areaOrder(grid: Pick<CoverGrid, 'areas'>): string[] {
  const names: string[] = [];
  for (const line of grid.areas) {
    for (const name of line) if (name !== EMPTY_AREA && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The grid with the areas that have cells, each with its settings or empty ones, or the reason why
 * the areas are not rectangles.
 */
function finish(grid: CoverGrid): GridEdit {
  const problem = placeAreas(grid.areas, grid.columns.length).problems[0];
  if (problem !== undefined) return { ok: false, message: problem };
  const area: Record<string, CoverArea> = {};
  for (const name of areaOrder(grid)) area[name] = grid.area[name] ?? EMPTY;
  return { ok: true, grid: { ...grid, area } };
}

/** The name a cell next to a new line gets: that of the area on both sides, so a span stays whole. */
const bridge = (before: string | undefined, after: string | undefined): string =>
  before !== undefined && before === after ? before : EMPTY_AREA;

/** The grid with a column of `width` before column `at` (at the end for the number of columns). */
export function insertColumn(grid: CoverGrid, at: number, width: CoverColumnWidth): CoverGrid {
  const columns = [...grid.columns];
  columns.splice(at, 0, width);
  const areas = grid.areas.map((line) => {
    const next = [...line];
    next.splice(at, 0, bridge(line[at - 1], line[at]));
    return next;
  });
  return { ...grid, columns, areas };
}

/** The grid with a row of `height` before row `at` (at the end for the number of rows). */
export function insertRow(grid: CoverGrid, at: number, height: CoverRowHeight): CoverGrid {
  const rows = [...grid.rows];
  rows.splice(at, 0, height);
  const above = grid.areas[at - 1];
  const below = grid.areas[at];
  const line = grid.columns.map((_, column) => bridge(above?.[column], below?.[column]));
  const areas = [...grid.areas];
  areas.splice(at, 0, line);
  return { ...grid, rows, areas };
}

/** The grid without column `index`; an area with no other cells goes with it. */
export function removeColumn(grid: CoverGrid, index: number): GridEdit {
  if (grid.columns.length <= 1) return { ok: false, message: 'A grid has at least one column.' };
  return finish({
    ...grid,
    columns: grid.columns.filter((_, at) => at !== index),
    areas: grid.areas.map((line) => line.filter((_, at) => at !== index)),
  });
}

/** The grid without row `index`; an area with no other cells goes with it. */
export function removeRow(grid: CoverGrid, index: number): GridEdit {
  if (grid.rows.length <= 1) return { ok: false, message: 'A grid has at least one row.' };
  return finish({
    ...grid,
    rows: grid.rows.filter((_, at) => at !== index),
    areas: grid.areas.filter((_, at) => at !== index),
  });
}

/** The grid with one column or row changed in size. */
export const setColumn = (grid: CoverGrid, index: number, width: CoverColumnWidth): CoverGrid => ({
  ...grid,
  columns: grid.columns.map((current, at) => (at === index ? width : current)),
});

export const setRow = (grid: CoverGrid, index: number, height: CoverRowHeight): CoverGrid => ({
  ...grid,
  rows: grid.rows.map((current, at) => (at === index ? height : current)),
});

/** `area-1`, `area-2` and so on: the first that no area has. */
export function newAreaName(grid: Pick<CoverGrid, 'areas' | 'area'>): string {
  const taken = new Set([...areaOrder(grid), ...Object.keys(grid.area)]);
  let number = 1;
  while (taken.has(`area-${String(number)}`)) number += 1;
  return `area-${String(number)}`;
}

/**
 * The grid with the cells of `range` given to the area `name`, a new one or one that exists, or
 * cleared with `.`. Cells taken from another area leave it; an area left with no cells is removed,
 * and one that is no longer a rectangle makes the change fail.
 */
export function setCells(grid: CoverGrid, range: CellRange, name: string): GridEdit {
  if (!isAreaName(name)) return { ok: false, message: `"${name}" cannot name an area.` };
  const inside = (row: number, column: number): boolean =>
    row >= range.row &&
    row < range.row + range.rowSpan &&
    column >= range.column &&
    column < range.column + range.columnSpan;
  return finish({
    ...grid,
    areas: grid.areas.map((line, row) =>
      line.map((cell, column) => (inside(row, column) ? name : cell)),
    ),
  });
}

/** The grid with an area under another name, which must be free. */
export function renameArea(grid: CoverGrid, from: string, to: string): GridEdit {
  if (from === to) return { ok: true, grid };
  if (to === EMPTY_AREA || !isAreaName(to)) {
    return { ok: false, message: `"${to}" cannot name an area: use kebab-case, such as logo.` };
  }
  if (areaOrder(grid).includes(to)) {
    return { ok: false, message: `There is an area "${to}" already.` };
  }
  const area: Record<string, CoverArea> = {};
  for (const [name, value] of Object.entries(grid.area)) area[name === from ? to : name] = value;
  return finish({
    ...grid,
    areas: grid.areas.map((line) => line.map((cell) => (cell === from ? to : cell))),
    area,
  });
}

/** The grid with the settings or entries of one area changed. */
export const setArea = (grid: CoverGrid, name: string, area: CoverArea): CoverGrid => ({
  ...grid,
  area: { ...grid.area, [name]: area },
});

/**
 * The rows of a grid of one column, an area for each row, or undefined when the grid has more
 * columns or an area spans rows, which rows cannot show.
 */
export function gridRows(grid: CoverGrid): CoverLayoutRow[] | undefined {
  if (grid.columns.length !== 1) return undefined;
  const names = grid.areas.map((line) => line[0] ?? EMPTY_AREA);
  const spansRows = names.some(
    (name, index) => name !== EMPTY_AREA && names.indexOf(name) !== index,
  );
  if (spansRows) return undefined;
  return grid.rows.map((height, index) => {
    const area = grid.area[names[index] ?? EMPTY_AREA] ?? EMPTY;
    return {
      height,
      valign: area.valign,
      ...(area.background !== undefined ? { background: area.background } : {}),
      content: area.content,
    };
  });
}

/** The entries of a grid in the order of its areas, as a list. */
export const gridEntries = (grid: CoverGrid): CoverEntry[] =>
  areaOrder(grid).flatMap((name) => grid.area[name]?.content ?? []);

/** A grid of one area with entries, for a list that becomes a grid. */
export const entriesGrid = (entries: readonly CoverEntry[]): CoverGrid => ({
  kind: 'grid',
  columns: [{ kind: 'share', fr: 1 }],
  rows: [{ kind: 'share', fr: 1 }],
  areas: [['area-1']],
  area: { 'area-1': { valign: 'top', content: entries } },
});

/**
 * The three slots of a header or footer as a grid of three columns, the text of each slot in a
 * paragraph of the style of the line. The alignment comes from paragraph styles, so the person
 * chooses a centred and a right style for the other two areas.
 */
export function slotsGrid(band: HeaderFooter | undefined): CoverGrid {
  const slots = ['left', 'center', 'right'] as const;
  const area: Record<string, CoverArea> = {};
  for (const slot of slots) {
    const text = band?.[slot] ?? [];
    area[slot] = {
      valign: 'top',
      content:
        text.length === 0
          ? []
          : [
              {
                kind: 'paragraph',
                ...(band?.style !== undefined ? { style: band.style } : {}),
                text,
              },
            ],
    };
  }
  return {
    kind: 'grid',
    columns: slots.map(() => ({ kind: 'share', fr: 1 })),
    rows: [{ kind: 'auto' }],
    areas: [[...slots]],
    area,
  };
}
