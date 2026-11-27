import {
  COVER_ALIGNMENTS,
  SLOT_TOKENS,
  areaOrder,
  insertColumn,
  insertRow,
  newAreaName,
  removeColumn,
  removeRow,
  renameArea,
  setArea,
  setCells,
  setColumn,
  setRow,
  slotsGrid,
  type CellRange,
  type CoverColumnWidth,
  type CoverGrid,
  type GridEdit,
  type HeaderFooter,
  type PageTemplate,
  type Stylesheet,
} from '@stanza/core';
import { headerFooterSource } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { el, option, redrawKeepingFocus, simpleRow as row } from './styles-dom.js';
import {
  button,
  entriesBox,
  heightText,
  parseHeight,
  without,
  type EntriesContext,
} from './styles-entries.js';
import { numberFrom } from './styles-properties.js';

/**
 * The grid of a cover, header or footer in the Pages panel (ADR 0096): the numbers of its columns
 * and rows, and its areas with their settings and entries. Areas are drawn in the preview, where a
 * drag across cells makes them; this file applies what the preview asks for.
 */

/** What a grid in the panel belongs to, and what the preview tells the panel it edits. */
export type GridTarget = 'cover' | 'header' | 'footer';

/** What the preview offers for cells that were dragged across. */
export type CellAction =
  | { readonly kind: 'new' }
  | { readonly kind: 'add'; readonly name: string }
  | { readonly kind: 'clear' };

/** The grid after an action on cells, and the area to select after it. */
export function applyCells(
  grid: CoverGrid,
  range: CellRange,
  action: CellAction,
): GridEdit & { readonly select?: string } {
  if (action.kind === 'clear') return setCells(grid, range, '.');
  const name = action.kind === 'new' ? newAreaName(grid) : action.name;
  const edit = setCells(grid, range, name);
  return edit.ok ? { ...edit, select: name } : edit;
}

/** `225` is points, `1fr` is a share; undefined for anything else, as a column cannot grow. */
export function parseWidth(text: string): CoverColumnWidth | undefined {
  const value = text.trim();
  const share = /^(\d+(?:\.\d+)?)fr$/.exec(value);
  if (share !== null) return { kind: 'share', fr: Number(share[1]) };
  const points = numberFrom(value);
  return points === undefined || points === null || points <= 0
    ? undefined
    : { kind: 'points', pt: points };
}

const widthText = (width: CoverColumnWidth): string =>
  width.kind === 'points' ? String(width.pt) : `${String(width.fr)}fr`;

export interface GridContext {
  readonly entries: EntriesContext;
  /** The area that is selected, in the panel and in the preview. */
  readonly selected: string | undefined;
  /** Writes a changed grid; `redraw` when the panel must be drawn again. */
  write(grid: CoverGrid, redraw: boolean): void;
  /** Says why a change cannot be made. */
  refuse(message: string): void;
  select(name: string | undefined): void;
}

/** A list of sizes, each with buttons to insert one after it and to remove it. */
function sizeList<T>(
  label: string,
  sizes: readonly T[],
  text: (size: T) => string,
  parse: (text: string) => T | undefined,
  hint: string,
  actions: {
    set(index: number, size: T): void;
    insert(at: number): void;
    remove(index: number): void;
    refuse(message: string): void;
  },
): HTMLElement {
  const box = el('div', 'grid-sizes');
  sizes.forEach((size, index) => {
    const input = el('input');
    input.type = 'text';
    input.value = text(size);
    input.placeholder = 'grows';
    input.addEventListener('change', () => {
      const parsed = parse(input.value);
      if (parsed === undefined) actions.refuse(`"${input.value}" is not a size: ${hint}`);
      else actions.set(index, parsed);
    });
    const buttons = el('span', 'cover-buttons');
    buttons.append(
      button('+', `Insert a ${label.toLowerCase()} after this one`, () => {
        actions.insert(index + 1);
      }),
      button('✕', `Remove the ${label.toLowerCase()}, and the areas that are only in it`, () => {
        actions.remove(index);
      }),
    );
    box.append(row(`${label} ${String(index + 1)}`, input, buttons));
  });
  return box;
}

/** The panel of a grid: columns, rows, and each area with its settings and entries. */
export function gridPanel(grid: CoverGrid, context: GridContext): HTMLElement[] {
  const write = (edit: GridEdit, redraw = true): void => {
    if (edit.ok) context.write(edit.grid, redraw);
    else context.refuse(edit.message);
  };
  const columns = sizeList(
    'Column',
    grid.columns,
    widthText,
    parseWidth,
    'write points such as 225, or a share such as 1fr.',
    {
      set: (index, width) => {
        context.write(setColumn(grid, index, width), false);
      },
      insert: (at) => {
        context.write(insertColumn(grid, at, { kind: 'share', fr: 1 }), true);
      },
      remove: (index) => {
        write(removeColumn(grid, index));
      },
      refuse: (message) => {
        context.refuse(message);
      },
    },
  );
  const rows = sizeList(
    'Row',
    grid.rows,
    heightText,
    parseHeight,
    'write points such as 100, a share such as 2fr, or nothing to grow with the content.',
    {
      set: (index, height) => {
        context.write(setRow(grid, index, height), false);
      },
      insert: (at) => {
        context.write(insertRow(grid, at, { kind: 'auto' }), true);
      },
      remove: (index) => {
        write(removeRow(grid, index));
      },
      refuse: (message) => {
        context.refuse(message);
      },
    },
  );
  const boxes = areaOrder(grid).map((name) => {
    const area = grid.area[name] ?? { valign: 'top' as const, content: [] };
    const box = el('div', 'cover-row-box grid-area');
    box.dataset['area'] = name;
    if (name === context.selected) box.classList.add('selected');
    box.addEventListener('focusin', () => {
      if (context.selected !== name) context.select(name);
    });
    const label = el('input', 'grid-area-name');
    label.type = 'text';
    label.value = name;
    label.title = 'The name of the area, in kebab-case';
    label.addEventListener('change', () => {
      const renamed = renameArea(grid, name, label.value.trim());
      if (!renamed.ok) {
        label.value = name;
        context.refuse(renamed.message);
        return;
      }
      context.write(renamed.grid, true);
      context.select(label.value.trim());
    });
    const valign = el('select');
    valign.append(...COVER_ALIGNMENTS.map((value) => option(value, value)));
    valign.value = area.valign;
    valign.addEventListener('change', () => {
      const chosen = COVER_ALIGNMENTS.find((value) => value === valign.value) ?? 'top';
      context.write(setArea(grid, name, { ...area, valign: chosen }), false);
    });
    const background = el('select');
    const tokens = [...context.entries.stylesheet.tokens.colors.keys()];
    background.append(option('', '(none)'), ...tokens.map((token) => option(token, token)));
    background.value = area.background?.kind === 'token' ? area.background.name : '';
    background.title = 'A color token that fills the area (ADR 0093)';
    background.addEventListener('change', () => {
      const rest = without(area, 'background');
      context.write(
        setArea(
          grid,
          name,
          background.value === ''
            ? rest
            : { ...rest, background: { kind: 'token', name: background.value } },
        ),
        false,
      );
    });
    const head = el('div', 'cover-head');
    head.append(label);
    box.append(
      head,
      row('Align', valign),
      row('Background', background),
      entriesBox(area.content, context.entries, (content) => {
        context.write(
          setArea(grid, name, { ...area, content }),
          content.length !== area.content.length ||
            content.some((entry, index) => entry.kind !== area.content[index]?.kind),
        );
      }),
    );
    return box;
  });
  return [
    el('p', 'hint', 'Widths in points or shares such as 1fr; heights also empty, to grow.'),
    columns,
    button('Add a column', 'Add a column at the right', () => {
      context.write(insertColumn(grid, grid.columns.length, { kind: 'share', fr: 1 }), true);
    }),
    rows,
    button('Add a row', 'Add a row at the bottom', () => {
      context.write(insertRow(grid, grid.rows.length, { kind: 'auto' }), true);
    }),
    el(
      'p',
      'hint',
      'Drag across the cells of the preview to make an area of them, to add them to an area, or to clear them. Click an area there to find it here.',
    ),
    ...(boxes.length > 0 ? boxes : [el('p', 'hint', 'No areas yet.')]),
  ];
}

/** Marks the selected area in a drawn panel and scrolls to it. */
export function markArea(root: HTMLElement, name: string | undefined): void {
  for (const box of root.querySelectorAll<HTMLElement>('.grid-area')) {
    const selected = box.dataset['area'] === name;
    box.classList.toggle('selected', selected);
    // A test document may have no scrolling.
    if (selected && 'scrollIntoView' in box) box.scrollIntoView({ block: 'nearest' });
  }
}

export interface BandGridEditor {
  readonly element: HTMLElement;
  update(name: string, template: PageTemplate, stylesheet: Stylesheet): void;
  /** The header or footer becomes a grid with the text of its slots, or slots with none. */
  setKind(kind: 'slots' | 'grid'): void;
  cells(range: CellRange, action: CellAction): void;
  selectArea(name: string | undefined): void;
  reset(): void;
}

/**
 * The grid of a header or footer (ADR 0096). Its style and distance stay with the slots in the
 * Pages panel; a change of the grid writes the whole header or footer again.
 */
export function createBandGridEditor(
  band: 'header' | 'footer',
  options: {
    readonly send: (message: StylesWebviewMessage) => void;
    readonly images: () => readonly string[];
    readonly listId: string;
    readonly refuse: (message: string) => void;
    /** The area that is selected, for the preview. */
    readonly selected: (name: string | undefined) => void;
  },
): BandGridEditor {
  const element = el('div', 'cover-editor band-grid');
  let current:
    | {
        name: string;
        spec: HeaderFooter | undefined;
        stylesheet: Stylesheet;
        template: PageTemplate;
      }
    | undefined;
  let selected: string | undefined;
  let drawnKey: string | undefined;

  const keyOf = (spec: HeaderFooter | undefined): string =>
    spec === undefined ? '' : headerFooterSource(spec);

  function write(spec: HeaderFooter, redraw: boolean): void {
    if (current === undefined) return;
    current.spec = spec;
    drawnKey = keyOf(spec);
    options.send({
      type: 'set-block',
      path: ['page-templates', current.name, band],
      source: headerFooterSource(spec),
    });
    // Every field holds the model it was drawn with, so the panel is drawn again after a change.
    if (redraw) draw();
    else redrawKeepingFocus(element, draw);
  }

  const base = (): HeaderFooter => ({
    ...(current?.spec?.style !== undefined ? { style: current.spec.style } : {}),
    ...(current?.spec?.distancePt !== undefined ? { distancePt: current.spec.distancePt } : {}),
    left: [],
    center: [],
    right: [],
  });

  const writeGrid = (grid: CoverGrid, redraw: boolean): void => {
    write({ ...base(), grid }, redraw);
  };

  function select(name: string | undefined): void {
    selected = name;
    markArea(element, name);
    options.selected(name);
  }

  function draw(): void {
    const grid = current?.spec?.grid;
    element.hidden = grid === undefined;
    if (current === undefined || grid === undefined) {
      element.replaceChildren();
      return;
    }
    element.replaceChildren(
      ...gridPanel(grid, {
        entries: {
          stylesheet: current.stylesheet,
          images: options.images(),
          listId: options.listId,
          tokens: SLOT_TOKENS,
        },
        selected,
        write: writeGrid,
        refuse: options.refuse,
        select,
      }),
    );
  }

  return {
    element,
    update(name, template, stylesheet) {
      const spec = template[band];
      const key = keyOf(spec);
      const same = current?.name === name && key === drawnKey;
      current = { name, spec, stylesheet, template };
      if (same) return;
      drawnKey = key;
      draw();
    },
    setKind(kind) {
      if (current === undefined) return;
      if (kind === 'grid' && current.spec?.grid === undefined) {
        writeGrid(slotsGrid(current.spec), true);
      } else if (kind === 'slots' && current.spec?.grid !== undefined) {
        write(base(), true);
      }
    },
    cells(range, action) {
      const grid = current?.spec?.grid;
      if (grid === undefined) return;
      const edit = applyCells(grid, range, action);
      if (!edit.ok) {
        options.refuse(edit.message);
        return;
      }
      selected = edit.select;
      writeGrid(edit.grid, true);
      options.selected(selected);
    },
    selectArea(name) {
      selected = name;
      markArea(element, name);
    },
    reset() {
      drawnKey = undefined;
      if (current !== undefined) {
        current.spec = current.template[band];
        drawnKey = keyOf(current.spec);
        draw();
      }
    },
  };
}
