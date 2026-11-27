import {
  COVER_ALIGNMENTS,
  coverGrid,
  entriesGrid,
  gridEntries,
  gridRows,
  type CellRange,
  type Cover,
  type CoverEntry,
  type CoverLayoutRow,
  type PageMargins,
  type PageTemplate,
  type Stylesheet,
} from '@stanza/core';
import { coverSource, entriesSource } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import {
  el,
  option,
  redrawKeepingFocus,
  simpleRow as row,
  simpleSection as section,
} from './styles-dom.js';
import {
  button,
  entriesBox,
  heightText,
  itemButtons,
  moved,
  parseHeight,
  removed,
  replaced,
  without,
  type EntriesContext,
} from './styles-entries.js';
import { applyCells, gridPanel, markArea, type CellAction } from './styles-grid.js';
import { numberFrom } from './styles-properties.js';

export { heightText, parseHeight } from './styles-entries.js';

/**
 * The cover and the title block of a page template in the Pages panel (ADR 0091). The panel keeps
 * a model of both, draws it, and after every change writes the whole cover or title block back to
 * the host as YAML, which it applies as one edit. Text that the panel edits is kept as it is written
 * in the stylesheet, as one text part, so that `slotSource` writes it unchanged and the stylesheet
 * reads its tokens.
 */

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SIDE_KEYS = { top: 'topPt', right: 'rightPt', bottom: 'bottomPt', left: 'leftPt' } as const;

type Kind = 'none' | 'list' | 'rows' | 'grid';

export interface CoverEditor {
  readonly element: HTMLElement;
  /** Draws the cover and title block of a template, unless they are what is drawn already. */
  update(name: string, template: PageTemplate, stylesheet: Stylesheet): void;
  /** The paths of the images of the project, to choose from. */
  setImages(paths: readonly string[]): void;
  /** Draws again from the stylesheet, after a change was refused. */
  reset(): void;
  /** Applies what the preview asks for cells of a grid cover (ADR 0096). */
  cells(range: CellRange, action: CellAction): void;
  /** Marks an area of a grid cover, which the preview selected. */
  selectArea(name: string | undefined): void;
  /** Shows the cover for the cover page, or the title block for the body pages (ADR 0096). */
  showPart(part: 'cover' | 'body'): void;
}

export function createCoverEditor(
  send: (message: StylesWebviewMessage) => void,
  /** Tells the preview which area of a grid cover is selected. */
  selected: (name: string | undefined) => void = () => undefined,
): CoverEditor {
  const element = el('div', 'cover-editor');
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  const coverRoot = el('div');
  const titleRoot = el('div');
  const list = el('datalist');
  list.id = 'cover-images';
  const coverSection = section(
    'Cover',
    el(
      'p',
      'hint',
      'A list from the top, rows from top to bottom, or a grid of areas. Heights are points, shares such as 2fr, or empty to grow with the content. Values the program fills in are links, such as [](stanza:title).',
    ),
    coverRoot,
  );
  const titleSection = section(
    'Title block',
    el('p', 'hint', 'Written at the top of the first page of the body, before its text.'),
    titleRoot,
  );
  element.append(status, list, coverSection, titleSection);

  let images: readonly string[] = [];
  /** The area of a grid cover that is selected in the panel and the preview. */
  let selectedArea: string | undefined;
  let current:
    | {
        readonly name: string;
        readonly template: PageTemplate;
        readonly stylesheet: Stylesheet;
        cover: Cover | undefined;
        titleBlock: readonly CoverEntry[] | undefined;
      }
    | undefined;
  /** What is drawn, so that the text the host sends back after an edit does not draw it again. */
  let drawnKey: string | undefined;

  const keyOf = (cover: Cover | undefined, titleBlock: readonly CoverEntry[] | undefined) =>
    JSON.stringify([
      cover === undefined ? null : coverSource(cover),
      titleBlock === undefined ? null : entriesSource(titleBlock),
    ]);

  const context = (): EntriesContext => ({
    stylesheet: current?.stylesheet ?? ({} as Stylesheet),
    images,
    listId: list.id,
  });

  function writeCover(cover: Cover | undefined, redraw: boolean): void {
    if (current === undefined) return;
    status.textContent = '';
    current.cover = cover;
    drawnKey = keyOf(current.cover, current.titleBlock);
    send({
      type: 'set-block',
      path: ['page-templates', current.name, 'cover'],
      source: cover === undefined ? null : coverSource(cover),
    });
    // Every field holds the model it was drawn with, so the panel is drawn again after a change.
    if (redraw) draw();
    else redrawKeepingFocus(element, draw);
  }

  function writeTitleBlock(entries: readonly CoverEntry[] | undefined, redraw: boolean): void {
    if (current === undefined) return;
    status.textContent = '';
    current.titleBlock = entries;
    drawnKey = keyOf(current.cover, current.titleBlock);
    send({
      type: 'set-block',
      path: ['page-templates', current.name, 'title-block'],
      source: entries === undefined ? null : entriesSource(entries),
    });
    if (redraw) draw();
    else redrawKeepingFocus(element, draw);
  }

  /** A change of the list of entries redraws only when entries were added, moved or removed. */
  const sameShape = (a: readonly CoverEntry[], b: readonly CoverEntry[]): boolean =>
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.kind === b[index]?.kind &&
        (entry.kind !== 'table' || entry.rows.length === (b[index] as typeof entry).rows.length),
    );

  /** The margins of a cover of rows or a grid; empty takes the margin of the page. */
  function marginBox(cover: Cover & { kind: 'rows' | 'grid' }): HTMLElement {
    const template = current?.template;
    const margins = SIDES.map((side) => {
      const input = el('input');
      input.type = 'number';
      input.step = 'any';
      input.min = '0';
      input.placeholder = template === undefined ? '' : String(template.margins[SIDE_KEYS[side]]);
      const own = cover.margins?.[SIDE_KEYS[side]];
      input.value = own === undefined ? '' : String(own);
      input.addEventListener('change', () => {
        const value = numberFrom(input.value);
        if (value === undefined) return;
        const key = SIDE_KEYS[side];
        const others: Partial<PageMargins> = without({ ...cover.margins }, key);
        const next: Partial<PageMargins> = value === null ? others : { ...others, [key]: value };
        const rest = without(cover, 'margins');
        writeCover(
          (Object.keys(next).length === 0 ? rest : { ...rest, margins: next }) as Cover,
          false,
        );
      });
      return row(side.charAt(0).toUpperCase() + side.slice(1), input, el('span', 'unit', 'pt'));
    });
    const box = el('div', 'cover-margins');
    box.append(
      el('p', 'hint', 'Margins of the cover; empty takes the margin of the page.'),
      ...margins,
    );
    return box;
  }

  function drawRows(cover: Cover & { kind: 'rows' }): HTMLElement[] {
    const setRows = (rows: readonly CoverLayoutRow[], redraw: boolean): void => {
      writeCover({ ...cover, rows }, redraw);
    };
    const rowBoxes = cover.rows.map((layoutRow, index) => {
      const box = el('div', 'cover-row-box');
      const head = el('div', 'cover-head');
      head.append(
        el('span', 'cover-kind', `Row ${String(index + 1)}`),
        itemButtons('row', (action) => {
          if (action === 'remove') setRows(removed(cover.rows, index), true);
          else setRows(moved(cover.rows, index, action === 'up' ? -1 : 1), true);
        }),
      );
      const height = el('input');
      height.type = 'text';
      height.value = heightText(layoutRow.height);
      height.placeholder = 'grows';
      height.addEventListener('change', () => {
        const parsed = parseHeight(height.value);
        if (parsed === undefined) {
          status.textContent = `"${height.value}" is not a height: write points such as 100, a share such as 2fr, or nothing.`;
          return;
        }
        setRows(replaced(cover.rows, index, { ...layoutRow, height: parsed }), false);
      });
      const valign = el('select');
      valign.append(...COVER_ALIGNMENTS.map((value) => option(value, value)));
      valign.value = layoutRow.valign;
      valign.addEventListener('change', () => {
        const chosen = COVER_ALIGNMENTS.find((value) => value === valign.value) ?? 'top';
        setRows(replaced(cover.rows, index, { ...layoutRow, valign: chosen }), false);
      });
      const background = el('select');
      const tokens = [...(current?.stylesheet.tokens.colors.keys() ?? [])];
      background.append(option('', '(none)'), ...tokens.map((name) => option(name, name)));
      background.value = layoutRow.background?.kind === 'token' ? layoutRow.background.name : '';
      background.title = 'A color token that fills the row (ADR 0093)';
      background.addEventListener('change', () => {
        const rest = without(layoutRow, 'background');
        setRows(
          replaced(
            cover.rows,
            index,
            background.value === ''
              ? rest
              : { ...rest, background: { kind: 'token', name: background.value } },
          ),
          false,
        );
      });
      box.append(
        head,
        row('Height', height),
        row('Align', valign),
        row('Background', background),
        entriesBox(layoutRow.content, context(), (content) => {
          setRows(
            replaced(cover.rows, index, { ...layoutRow, content }),
            !sameShape(layoutRow.content, content),
          );
        }),
      );
      return box;
    });
    const addRow = button('Add a row', 'Add a row at the bottom of the cover', () => {
      const grows = cover.rows.some((existing) => existing.height.kind === 'share');
      setRows(
        [
          ...cover.rows,
          {
            height: grows ? { kind: 'share', fr: 1 } : { kind: 'auto' },
            valign: 'top',
            content: [],
          },
        ],
        true,
      );
    });
    return [marginBox(cover), ...rowBoxes, addRow];
  }

  function draw(): void {
    if (current === undefined) return;
    const cover = current.cover;
    const kind: Kind = cover === undefined ? 'none' : cover.kind;
    const select = el('select');
    select.append(
      option('none', 'No cover'),
      option('list', 'A list from the top'),
      option('rows', 'Rows'),
      option('grid', 'A grid of areas'),
    );
    select.value = kind;
    select.addEventListener('change', () => {
      const entries =
        cover === undefined
          ? []
          : cover.kind === 'list'
            ? cover.entries
            : cover.kind === 'rows'
              ? cover.rows.flatMap((layoutRow) => layoutRow.content)
              : gridEntries(cover);
      const margins = cover?.kind === 'rows' || cover?.kind === 'grid' ? cover.margins : undefined;
      const withMargins = margins !== undefined ? { margins } : {};
      if (select.value === 'none') writeCover(undefined, true);
      else if (select.value === 'list') writeCover({ kind: 'list', entries }, true);
      else if (select.value === 'grid') {
        // Rows keep their places as a grid of one column; anything else becomes one area.
        const grid = cover?.kind === 'rows' ? coverGrid(cover) : entriesGrid(entries);
        writeCover({ ...grid, ...withMargins }, true);
      } else if (cover?.kind === 'grid') {
        const rows = gridRows(cover);
        if (rows === undefined) {
          select.value = 'grid';
          status.textContent =
            'Only a grid of one column, without an area across rows, can become rows; make it a list, or change the grid first.';
          return;
        }
        writeCover({ kind: 'rows', ...withMargins, rows }, true);
      } else {
        writeCover(
          {
            kind: 'rows',
            ...withMargins,
            rows: [{ height: { kind: 'auto' }, valign: 'top', content: entries }],
          },
          true,
        );
      }
    });
    const parts: HTMLElement[] = [row('Kind', select)];
    if (cover?.kind === 'list') {
      parts.push(
        entriesBox(cover.entries, context(), (entries) => {
          writeCover({ kind: 'list', entries }, !sameShape(cover.entries, entries));
        }),
      );
    } else if (cover?.kind === 'rows') {
      parts.push(...drawRows(cover));
    } else if (cover?.kind === 'grid') {
      parts.push(
        marginBox(cover),
        ...gridPanel(cover, {
          entries: context(),
          selected: selectedArea,
          write: (grid, redraw) => {
            writeCover(grid, redraw);
          },
          refuse: (message) => {
            status.textContent = message;
          },
          select: (name) => {
            selectedArea = name;
            markArea(coverRoot, name);
            selected(name);
          },
        }),
      );
    }
    coverRoot.replaceChildren(...parts);
    drawTitleBlock();
  }

  function drawTitleBlock(): void {
    if (current === undefined) return;
    const titleBlock = current.titleBlock;
    const toggle = el('select');
    toggle.append(option('none', 'No title block'), option('entries', 'A title block'));
    toggle.value = titleBlock === undefined ? 'none' : 'entries';
    toggle.addEventListener('change', () => {
      writeTitleBlock(toggle.value === 'none' ? undefined : (titleBlock ?? []), true);
    });
    titleRoot.replaceChildren(
      row('Kind', toggle),
      ...(titleBlock === undefined
        ? []
        : [
            entriesBox(titleBlock, context(), (entries) => {
              writeTitleBlock(entries, !sameShape(titleBlock, entries));
            }),
          ]),
    );
  }

  return {
    element,
    update(name, template, stylesheet) {
      const key = keyOf(template.cover, template.titleBlock);
      const same = current?.name === name && key === drawnKey;
      current = {
        name,
        template,
        stylesheet,
        cover: template.cover,
        titleBlock: template.titleBlock,
      };
      if (same) return;
      drawnKey = key;
      draw();
    },
    setImages(paths) {
      images = paths;
      list.replaceChildren(...paths.map((path) => option(path, path)));
    },
    cells(range, action) {
      const cover = current?.cover;
      if (cover?.kind !== 'grid') return;
      const edit = applyCells(cover, range, action);
      if (!edit.ok) {
        status.textContent = edit.message;
        return;
      }
      selectedArea = edit.select;
      writeCover(edit.grid, true);
      selected(selectedArea);
    },
    showPart(part) {
      coverSection.hidden = part !== 'cover';
      titleSection.hidden = part !== 'body';
    },
    selectArea(name) {
      selectedArea = name;
      markArea(coverRoot, name);
    },
    reset() {
      drawnKey = undefined;
      if (current !== undefined) {
        drawnKey = keyOf(current.template.cover, current.template.titleBlock);
        current.cover = current.template.cover;
        current.titleBlock = current.template.titleBlock;
        draw();
      }
    },
  };
}

/** Shows a message on the panel, as a refused change does elsewhere. */
export function refuseCover(editor: CoverEditor, message: string): void {
  const status = editor.element.querySelector('.status');
  if (status !== null) status.textContent = message;
  editor.reset();
}
