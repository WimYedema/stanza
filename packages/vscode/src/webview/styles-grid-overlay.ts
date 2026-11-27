import {
  EMPTY_AREA,
  areaOrder,
  placeAreas,
  setCells,
  type CellRange,
  type CoverGrid,
} from '@stanza/core';
import type { CellAction } from './styles-grid.js';

/**
 * The lines and areas of a grid drawn over its preview in the style editor (ADR 0096). A drag across
 * cells selects a rectangle of them, for which a bar offers a new area, adding them to an area, or
 * clearing them; a click in an area selects it.
 */

export interface OverlayHandlers {
  cells(range: CellRange, action: CellAction): void;
  select(name: string | undefined): void;
}

/** The rectangle between two cells. */
export const rangeOf = (
  a: { row: number; column: number },
  b: { row: number; column: number },
): CellRange => ({
  row: Math.min(a.row, b.row),
  column: Math.min(a.column, b.column),
  rowSpan: Math.abs(a.row - b.row) + 1,
  columnSpan: Math.abs(a.column - b.column) + 1,
});

/** The areas the cells can join: those that make a rectangle with them and do not hold them all. */
export function joinable(grid: CoverGrid, range: CellRange): string[] {
  return areaOrder(grid).filter((name) => {
    const holdsAll = grid.areas
      .slice(range.row, range.row + range.rowSpan)
      .every((line) =>
        line.slice(range.column, range.column + range.columnSpan).every((cell) => cell === name),
      );
    return !holdsAll && setCells(grid, range, name).ok;
  });
}

function buttonOf(text: string, title: string, click: () => void): HTMLButtonElement {
  const created = document.createElement('button');
  created.type = 'button';
  created.textContent = text;
  created.title = title;
  created.addEventListener('click', click);
  return created;
}

/**
 * Draws the cells, the names of the areas and the selected area over `layout`, the CSS grid of the
 * preview, and shows the actions for a selection of cells in `bar`.
 */
export function attachOverlay(
  layout: HTMLElement,
  grid: CoverGrid,
  selected: string | undefined,
  bar: HTMLElement,
  handlers: OverlayHandlers,
): void {
  layout.classList.add('editing');
  const cells: HTMLElement[][] = grid.areas.map((line, row) =>
    line.map((name, column) => {
      const cell = document.createElement('div');
      cell.className = name === EMPTY_AREA ? 'grid-cell empty' : 'grid-cell';
      cell.dataset['row'] = String(row);
      cell.dataset['column'] = String(column);
      cell.style.setProperty('grid-row', String(row + 1));
      cell.style.setProperty('grid-column', String(column + 1));
      layout.append(cell);
      return cell;
    }),
  );
  for (const area of placeAreas(grid.areas, grid.columns.length).areas) {
    const frame = document.createElement('div');
    frame.className = area.name === selected ? 'grid-frame selected' : 'grid-frame';
    frame.dataset['area'] = area.name;
    frame.style.setProperty('grid-row', `${String(area.row + 1)} / span ${String(area.rowSpan)}`);
    frame.style.setProperty(
      'grid-column',
      `${String(area.column + 1)} / span ${String(area.columnSpan)}`,
    );
    const label = document.createElement('span');
    label.className = 'grid-label';
    label.textContent = area.name;
    frame.append(label);
    layout.append(frame);
  }

  let anchor: { row: number; column: number } | undefined;
  let range: CellRange | undefined;
  const cellOf = (target: EventTarget | null): { row: number; column: number } | undefined => {
    if (!(target instanceof HTMLElement) || !target.classList.contains('grid-cell'))
      return undefined;
    return { row: Number(target.dataset['row']), column: Number(target.dataset['column']) };
  };
  const mark = (): void => {
    cells.forEach((line, row) => {
      line.forEach((cell, column) => {
        const inside =
          range !== undefined &&
          row >= range.row &&
          row < range.row + range.rowSpan &&
          column >= range.column &&
          column < range.column + range.columnSpan;
        cell.classList.toggle('picked', inside);
      });
    });
  };
  const close = (): void => {
    range = undefined;
    mark();
    bar.hidden = true;
    bar.replaceChildren();
  };
  const offer = (picked: CellRange): void => {
    const size = `${String(picked.columnSpan)} × ${String(picked.rowSpan)}`;
    const empty = grid.areas
      .slice(picked.row, picked.row + picked.rowSpan)
      .every((line) =>
        line
          .slice(picked.column, picked.column + picked.columnSpan)
          .every((cell) => cell === EMPTY_AREA),
      );
    const label = document.createElement('span');
    label.textContent = `${size} cells:`;
    bar.replaceChildren(
      label,
      buttonOf('New area', 'Make an area of these cells', () => {
        close();
        handlers.cells(picked, { kind: 'new' });
      }),
      ...joinable(grid, picked).map((name) =>
        buttonOf(`Add to ${name}`, `Make these cells part of the area ${name}`, () => {
          close();
          handlers.cells(picked, { kind: 'add', name });
        }),
      ),
      ...(empty
        ? []
        : [
            buttonOf('Clear', 'Make these cells part of no area', () => {
              close();
              handlers.cells(picked, { kind: 'clear' });
            }),
          ]),
      buttonOf('Cancel', 'Leave the cells as they are', close),
    );
    bar.hidden = false;
  };

  layout.addEventListener('mousedown', (event) => {
    const cell = cellOf(event.target);
    if (cell === undefined || event.button !== 0) return;
    event.preventDefault();
    anchor = cell;
    range = rangeOf(cell, cell);
    mark();
    // The drag ends where the button is let go, inside the grid or not.
    layout.ownerDocument.addEventListener('mouseup', finish, { once: true });
  });
  layout.addEventListener('mouseover', (event) => {
    const cell = cellOf(event.target);
    if (anchor === undefined || cell === undefined) return;
    range = rangeOf(anchor, cell);
    mark();
  });
  function finish(): void {
    if (anchor === undefined || range === undefined) return;
    anchor = undefined;
    const picked = range;
    // One cell in an area also selects the area, to find it in the panel.
    if (picked.rowSpan === 1 && picked.columnSpan === 1) {
      const name = grid.areas[picked.row]?.[picked.column];
      handlers.select(name === undefined || name === EMPTY_AREA ? undefined : name);
    }
    offer(picked);
  }
}
