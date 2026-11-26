import {
  COVER_ALIGNMENTS,
  SLOT_TOKENS,
  type Cover,
  type CoverEntry,
  type CoverLayoutRow,
  type CoverRowHeight,
  type PageMargins,
  type PageTemplate,
  type SlotPart,
  type StyleName,
  type Stylesheet,
} from '@stanza/core';
import { coverSource, entriesSource, slotSource } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { el, option, simpleRow as row, simpleSection as section } from './styles-dom.js';
import { numberFrom } from './styles-properties.js';

/**
 * The cover and the title block of a page template in the Pages panel (ADR 0091). The panel keeps
 * a model of both, draws it, and after every change writes the whole cover or title block back to
 * the host as YAML, which it applies as one edit. Text that the panel edits is kept as it is written
 * in the stylesheet, as one text part, so that `slotSource` writes it unchanged and the stylesheet
 * reads its tokens.
 */

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SIDE_KEYS = { top: 'topPt', right: 'rightPt', bottom: 'bottomPt', left: 'leftPt' } as const;

/** The text that stands in for a Word field, as in the slots of ADR 0051. */
const PLACEHOLDER_LABEL: Partial<Record<(typeof SLOT_TOKENS)[number], string>> = {
  page: '1',
  pages: '1',
};

/** The tokens that can be put on a cover; the others depend on pagination (ADR 0019). */
const COVER_TOKENS = SLOT_TOKENS.filter((token) => !['page', 'pages', 'section'].includes(token));

type Kind = 'none' | 'list' | 'rows';

export interface CoverEditor {
  readonly element: HTMLElement;
  /** Draws the cover and title block of a template, unless they are what is drawn already. */
  update(name: string, template: PageTemplate, stylesheet: Stylesheet): void;
  /** The paths of the images of the project, to choose from. */
  setImages(paths: readonly string[]): void;
  /** Draws again from the stylesheet, after a change was refused. */
  reset(): void;
}

/** Slot text as the person writes it, kept whole. */
const asText = (source: string): SlotPart[] =>
  source === '' ? [] : [{ kind: 'text', text: source }];

/** `100` is points, `2fr` is a share, and nothing is a row that grows; undefined for anything else. */
export function parseHeight(text: string): CoverRowHeight | undefined {
  const value = text.trim();
  if (value === '') return { kind: 'auto' };
  const share = /^(\d+(?:\.\d+)?)fr$/.exec(value);
  if (share !== null) return { kind: 'share', fr: Number(share[1]) };
  const points = numberFrom(value);
  return points === undefined || points === null ? undefined : { kind: 'points', pt: points };
}

export const heightText = (height: CoverRowHeight): string =>
  height.kind === 'points'
    ? String(height.pt)
    : height.kind === 'share'
      ? `${String(height.fr)}fr`
      : '';

/** A list with the item at `index` moved by `by`, or the list itself when it cannot move. */
function moved<T>(items: readonly T[], index: number, by: -1 | 1): readonly T[] {
  const target = index + by;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}

/** A copy of an object without one of its properties. */
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>;
}

const replaced = <T>(items: readonly T[], index: number, item: T): readonly T[] =>
  items.map((current, at) => (at === index ? item : current));

const removed = <T>(items: readonly T[], index: number): readonly T[] =>
  items.filter((_, at) => at !== index);

function button(text: string, title: string, click: () => void): HTMLButtonElement {
  const created = el('button', 'cover-button', text);
  created.type = 'button';
  created.title = title;
  created.addEventListener('click', click);
  return created;
}

/** Up, down and remove, for an item of a list. */
function itemButtons(
  label: string,
  change: (action: 'up' | 'down' | 'remove') => void,
): HTMLElement {
  const buttons = el('span', 'cover-buttons');
  buttons.append(
    button('↑', `Move the ${label} up`, () => {
      change('up');
    }),
    button('↓', `Move the ${label} down`, () => {
      change('down');
    }),
    button('✕', `Remove the ${label}`, () => {
      change('remove');
    }),
  );
  return buttons;
}

function styleSelect(
  names: Iterable<StyleName>,
  current: string | undefined,
  none: string | undefined,
  change: (value: string | undefined) => void,
): HTMLSelectElement {
  const select = el('select');
  select.append(
    ...(none === undefined ? [] : [option('', none)]),
    ...[...names].map((name) => option(name, name)),
  );
  select.value = current ?? '';
  select.addEventListener('change', () => {
    change(select.value === '' ? undefined : select.value);
  });
  return select;
}

/** A text of a slot, with the list that inserts a value at the cursor (ADR 0051). */
function slotInput(parts: readonly SlotPart[], change: (parts: SlotPart[]) => void): HTMLElement[] {
  const input = el('input');
  input.type = 'text';
  input.value = slotSource(parts);
  input.addEventListener('change', () => {
    change(asText(input.value));
  });
  const insert = el('select');
  insert.title = 'Insert a value that the program fills in';
  insert.append(
    option('', 'Insert…'),
    ...COVER_TOKENS.map((token) => option(token, token)),
    option('field:', 'field:…'),
  );
  insert.addEventListener('change', () => {
    const chosen = insert.value;
    insert.value = '';
    if (chosen === '') return;
    const token = COVER_TOKENS.find((candidate) => candidate === chosen);
    const link =
      token === undefined
        ? '[](stanza:field:name)'
        : `[${PLACEHOLDER_LABEL[token] ?? ''}](stanza:${token})`;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + link + input.value.slice(end);
    change(asText(input.value));
  });
  return [input, insert];
}

interface EntriesContext {
  readonly stylesheet: Stylesheet;
  readonly images: readonly string[];
  readonly listId: string;
}

/** The controls of one entry of a cover or a title block. */
function entryBox(
  entry: CoverEntry,
  context: EntriesContext,
  change: (entry: CoverEntry) => void,
  action: (action: 'up' | 'down' | 'remove') => void,
): HTMLElement {
  const box = el('div', 'cover-entry');
  const kind =
    entry.kind === 'paragraph' ? 'Paragraph' : entry.kind === 'table' ? 'Table' : 'Image';
  const head = el('div', 'cover-head');
  head.append(el('span', 'cover-kind', kind), itemButtons(kind.toLowerCase(), action));
  box.append(head);
  const paragraphStyles = context.stylesheet.paragraphStyles.keys();
  switch (entry.kind) {
    case 'paragraph': {
      box.append(
        row(
          'Style',
          styleSelect(paragraphStyles, entry.style, '(body)', (style) => {
            const rest = without(entry, 'style');
            change(style === undefined ? rest : { ...rest, style: style as StyleName });
          }),
        ),
        row(
          'Text',
          ...slotInput(entry.text, (text) => {
            change({ ...entry, text });
          }),
        ),
      );
      break;
    }
    case 'image': {
      const path = el('input');
      path.type = 'text';
      path.value = entry.path;
      path.setAttribute('list', context.listId);
      path.placeholder = 'assets/logo.png';
      path.addEventListener('change', () => {
        change({ ...entry, path: path.value.trim() });
      });
      const width = el('input');
      width.type = 'number';
      width.step = 'any';
      width.min = '0';
      width.placeholder = 'own size';
      width.value = entry.widthPt === undefined ? '' : String(entry.widthPt);
      width.addEventListener('change', () => {
        const value = numberFrom(width.value);
        if (value === undefined) return;
        const rest = without(entry, 'widthPt');
        change(value === null ? rest : { ...rest, widthPt: value });
      });
      box.append(
        row('File', path),
        row('Width', width, el('span', 'unit', 'pt')),
        row(
          'Style',
          styleSelect(paragraphStyles, entry.style, '(body)', (style) => {
            const rest = without(entry, 'style');
            change(style === undefined ? rest : { ...rest, style: style as StyleName });
          }),
        ),
      );
      break;
    }
    case 'table': {
      box.append(
        row(
          'Style',
          styleSelect(context.stylesheet.tableStyles.keys(), entry.style, undefined, (style) => {
            if (style !== undefined) change({ ...entry, style: style as StyleName });
          }),
        ),
      );
      entry.rows.forEach((tableRow, index) => {
        const label = el('input');
        label.type = 'text';
        label.value = tableRow.label;
        label.placeholder = 'Label';
        label.addEventListener('change', () => {
          change({
            ...entry,
            rows: replaced(entry.rows, index, { ...tableRow, label: label.value }),
          });
        });
        const line = el('div', 'cover-table-row');
        line.append(
          label,
          ...slotInput(tableRow.value, (value) => {
            change({ ...entry, rows: replaced(entry.rows, index, { ...tableRow, value }) });
          }),
          button('✕', 'Remove the row', () => {
            change({ ...entry, rows: removed(entry.rows, index) });
          }),
        );
        box.append(line);
      });
      box.append(
        button('Add a row', 'Add a row of a label and a value', () => {
          change({ ...entry, rows: [...entry.rows, { label: 'Label', value: [] }] });
        }),
      );
      break;
    }
  }
  return box;
}

/** The entries of a row, a list cover or a title block, with the buttons that add one. */
function entriesBox(
  entries: readonly CoverEntry[],
  context: EntriesContext,
  change: (entries: readonly CoverEntry[]) => void,
): HTMLElement {
  const box = el('div', 'cover-entries');
  entries.forEach((entry, index) => {
    box.append(
      entryBox(
        entry,
        context,
        (next) => {
          change(replaced(entries, index, next));
        },
        (action) => {
          if (action === 'remove') change(removed(entries, index));
          else change(moved(entries, index, action === 'up' ? -1 : 1));
        },
      ),
    );
  });
  const table = [...context.stylesheet.tableStyles.keys()][0];
  const adds = el('div', 'cover-adds');
  adds.append(
    el('span', 'unit', 'Add'),
    button('Paragraph', 'Add a paragraph', () => {
      change([...entries, { kind: 'paragraph', text: [] }]);
    }),
    button('Image', 'Add an image', () => {
      change([...entries, { kind: 'image', path: context.images[0] ?? 'assets/logo.png' }]);
    }),
    ...(table === undefined
      ? []
      : [
          button('Table', 'Add a table of labels and values', () => {
            change([...entries, { kind: 'table', style: table, rows: [] }]);
          }),
        ]),
  );
  box.append(adds);
  return box;
}

export function createCoverEditor(send: (message: StylesWebviewMessage) => void): CoverEditor {
  const element = el('div', 'cover-editor');
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  const coverRoot = el('div');
  const titleRoot = el('div');
  const list = el('datalist');
  list.id = 'cover-images';
  element.append(
    status,
    list,
    section(
      'Cover',
      el(
        'p',
        'hint',
        'Rows divide the cover page from top to bottom: a height in points, a share such as 2fr, or empty to grow with the content. Values the program fills in are links, such as [](stanza:title).',
      ),
      coverRoot,
    ),
    section(
      'Title block',
      el('p', 'hint', 'Written at the top of the first page of the body, before its text.'),
      titleRoot,
    ),
  );

  let images: readonly string[] = [];
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
    if (redraw) draw();
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
  }

  /** A change of the list of entries redraws only when entries were added, moved or removed. */
  const sameShape = (a: readonly CoverEntry[], b: readonly CoverEntry[]): boolean =>
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.kind === b[index]?.kind &&
        (entry.kind !== 'table' || entry.rows.length === (b[index] as typeof entry).rows.length),
    );

  function drawRows(cover: Cover & { kind: 'rows' }): HTMLElement[] {
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
        writeCover(Object.keys(next).length === 0 ? rest : { ...rest, margins: next }, false);
      });
      return row(side.charAt(0).toUpperCase() + side.slice(1), input, el('span', 'unit', 'pt'));
    });
    const marginBox = el('div', 'cover-margins');
    marginBox.append(
      el('p', 'hint', 'Margins of the cover; empty takes the margin of the page.'),
      ...margins,
    );

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
    return [marginBox, ...rowBoxes, addRow];
  }

  function draw(): void {
    if (current === undefined) return;
    const cover = current.cover;
    if (cover?.kind === 'grid') {
      // Editing a grid is item 230; until then the panel shows it and leaves it as it is.
      const select = el('select');
      select.append(option('grid', 'A grid of areas'));
      select.disabled = true;
      coverRoot.replaceChildren(
        row('Kind', select),
        el(
          'p',
          'hint',
          `The cover is a grid of ${String(cover.columns.length)} columns and ${String(cover.rows.length)} rows with the areas ${Object.keys(cover.area).join(', ') || '(none)'}. It is edited in the text of the stylesheet (ADR 0092).`,
        ),
      );
      drawTitleBlock();
      return;
    }
    const kind: Kind = cover === undefined ? 'none' : cover.kind;
    const select = el('select');
    select.append(
      option('none', 'No cover'),
      option('list', 'A list from the top'),
      option('rows', 'Rows'),
    );
    select.value = kind;
    select.addEventListener('change', () => {
      const entries =
        cover === undefined
          ? []
          : cover.kind === 'list'
            ? cover.entries
            : cover.rows.flatMap((layoutRow) => layoutRow.content);
      if (select.value === 'none') writeCover(undefined, true);
      else if (select.value === 'list') writeCover({ kind: 'list', entries }, true);
      else {
        const margins = cover?.kind === 'rows' ? cover.margins : undefined;
        writeCover(
          {
            kind: 'rows',
            ...(margins !== undefined ? { margins } : {}),
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
