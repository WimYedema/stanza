import {
  SLOT_TOKENS,
  type CoverEntry,
  type CoverRowHeight,
  type SlotPart,
  type StyleName,
  type Stylesheet,
} from '@stanza/core';
import { slotSource } from '@stanza/format';
import { el, option, simpleRow as row } from './styles-dom.js';
import { numberFrom } from './styles-properties.js';

/**
 * The parts of the Pages panel that edit entries (ADR 0091): paragraphs, tables and images, with
 * their buttons, for a cover of rows, a grid area (ADR 0096) or a title block.
 */

/** The text that stands in for a Word field, as in the slots of ADR 0051. */
export const PLACEHOLDER_LABEL: Partial<Record<(typeof SLOT_TOKENS)[number], string>> = {
  page: '1',
  pages: '1',
};

/** The tokens that can be put on a cover; the others depend on pagination (ADR 0019). */
export const COVER_TOKENS = SLOT_TOKENS.filter(
  (token) => !['page', 'pages', 'section'].includes(token),
);

/** Slot text as the person writes it, kept whole. */
export const asText = (source: string): SlotPart[] =>
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
export function moved<T>(items: readonly T[], index: number, by: -1 | 1): readonly T[] {
  const target = index + by;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}

/** A copy of an object without one of its properties. */
export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>;
}

export const replaced = <T>(items: readonly T[], index: number, item: T): readonly T[] =>
  items.map((current, at) => (at === index ? item : current));

export const removed = <T>(items: readonly T[], index: number): readonly T[] =>
  items.filter((_, at) => at !== index);

export function button(text: string, title: string, click: () => void): HTMLButtonElement {
  const created = el('button', 'cover-button', text);
  created.type = 'button';
  created.title = title;
  created.addEventListener('click', click);
  return created;
}

/** Up, down and remove, for an item of a list. */
export function itemButtons(
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

export function styleSelect(
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
export function slotInput(
  parts: readonly SlotPart[],
  change: (parts: SlotPart[]) => void,
  tokens: readonly (typeof SLOT_TOKENS)[number][] = COVER_TOKENS,
): HTMLElement[] {
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
    ...tokens.map((token) => option(token, token)),
    option('field:', 'field:…'),
  );
  insert.addEventListener('change', () => {
    const chosen = insert.value;
    insert.value = '';
    if (chosen === '') return;
    const token = tokens.find((candidate) => candidate === chosen);
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

export interface EntriesContext {
  readonly stylesheet: Stylesheet;
  /** The values that can be inserted; a header or footer can also show the page fields. */
  readonly tokens?: readonly (typeof SLOT_TOKENS)[number][];
  readonly images: readonly string[];
  readonly listId: string;
}

/** The controls of one entry of a cover or a title block. */
export function entryBox(
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
          ...slotInput(
            entry.text,
            (text) => {
              change({ ...entry, text });
            },
            context.tokens,
          ),
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
          ...slotInput(
            tableRow.value,
            (value) => {
              change({ ...entry, rows: replaced(entry.rows, index, { ...tableRow, value }) });
            },
            context.tokens,
          ),
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
export function entriesBox(
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

/**
 * A question in the panel before a change that loses what was made: what it loses, a button that
 * makes it, and one that keeps things as they are. A webview of VS Code cannot show a dialog.
 */
export function confirmBox(
  message: string,
  confirm: string,
  onConfirm: () => void,
  onCancel: () => void,
): HTMLElement {
  const box = el('div', 'confirm');
  box.setAttribute('role', 'alertdialog');
  const keep = button('Cancel', 'Leave it as it is', onCancel);
  box.append(el('p', '', message), button(confirm, message, onConfirm), keep);
  queueMicrotask(() => {
    keep.focus();
  });
  return box;
}
