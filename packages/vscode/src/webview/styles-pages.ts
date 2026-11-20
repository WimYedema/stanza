import { SLOT_TOKENS, type PageSize, type PageTemplate, type Stylesheet } from '@stanza/core';
import { slotSource } from '@stanza/format';
import type { StylesWebviewMessage, Value } from '../shared/styles-protocol.js';
import { el, option, simpleRow as row, simpleSection as section } from './styles-dom.js';
import type { Entry } from './styles-families.js';
import { numberFrom } from './styles-properties.js';

/**
 * The panel of a page template (ADR 0051): the size, the margins, and the header and footer with
 * their three slots. Changes go to the host as edits of the text of the stylesheet. The cover is
 * still edited as text.
 */

const SIZES: readonly PageSize[] = ['A4', 'Letter'];
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SLOTS = ['left', 'center', 'right'] as const;
const BANDS = ['header', 'footer'] as const;

/** The text that stands in for a Word field in a slot, where the number is not known. */
const PLACEHOLDER_LABEL: Partial<Record<(typeof SLOT_TOKENS)[number], string>> = {
  page: '1',
  pages: '1',
};

export interface PagePanelOptions {
  readonly root: HTMLElement;
  readonly send: (message: StylesWebviewMessage) => void;
}

export interface PagePanel {
  /** Shows the panel of a page template, or hides it for anything else, and says whether it is shown. */
  show(entry: Entry | undefined, stylesheet: Stylesheet): boolean;
  /** A change was refused: says why, and shows the stylesheet as it is. */
  refused(message: string): void;
}

const titleOf = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

export function createPagePanel({ root, send }: PagePanelOptions): PagePanel {
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  let current: { readonly name: string; readonly stylesheet: Stylesheet } | undefined;
  const updates: ((template: PageTemplate, stylesheet: Stylesheet) => void)[] = [];

  const commit = (keys: readonly string[], value: Value | null): void => {
    if (current === undefined) return;
    status.textContent = '';
    const path = ['page-templates', current.name, ...keys];
    send(value === null ? { type: 'unset', path } : { type: 'set', path, value });
  };

  const size = el('select');
  size.append(...SIZES.map((value) => option(value, value)));
  size.addEventListener('change', () => {
    commit(['size'], size.value);
  });
  updates.push((template) => {
    size.value = template.size;
  });

  const margins = SIDES.map((side) => {
    const input = el('input');
    input.type = 'number';
    input.step = 'any';
    input.min = '0';
    input.addEventListener('change', () => {
      const value = numberFrom(input.value);
      if (value !== undefined) commit(['margins', side], value);
    });
    updates.push((template) => {
      input.value = String(template.margins[`${side}Pt`]);
    });
    return row(titleOf(side), input, el('span', 'unit', 'pt'));
  });

  const bandSections = BANDS.map((band) => {
    const style = el('select');
    style.addEventListener('change', () => {
      commit([band, 'style'], style.value === '' ? null : style.value);
    });
    updates.push((template, stylesheet) => {
      const own = template[band]?.style;
      style.replaceChildren(
        option('', '(body)'),
        ...[...stylesheet.paragraphStyles.keys()].map((name) => option(name, name)),
      );
      style.value = own ?? '';
    });

    const slotRows = SLOTS.map((slot) => {
      const input = el('input');
      input.type = 'text';
      const write = (): void => {
        commit([band, slot], input.value === '' ? null : input.value);
      };
      input.addEventListener('change', write);
      const insert = el('select');
      insert.title = 'Insert a value that the program fills in';
      insert.append(
        option('', 'Insert\u2026'),
        ...SLOT_TOKENS.map((token) => option(token, token)),
      );
      insert.addEventListener('change', () => {
        const token = SLOT_TOKENS.find((candidate) => candidate === insert.value);
        insert.value = '';
        if (token === undefined) return;
        const link = `[${PLACEHOLDER_LABEL[token] ?? ''}](stanza:${token})`;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        input.value = input.value.slice(0, start) + link + input.value.slice(end);
        write();
      });
      updates.push((template) => {
        input.value = slotSource(template[band]?.[slot] ?? []);
      });
      const line = row(titleOf(slot), input, insert);
      line.classList.add('slot');
      return line;
    });

    return section(
      titleOf(band),
      el(
        'p',
        'hint',
        'Values the program fills in are written as links, such as [](stanza:title). Empty all three slots to leave the line blank.',
      ),
      row('Style', style),
      ...slotRows,
    );
  });

  root.append(
    status,
    section('Page', row('Size', size)),
    section('Margins', ...margins),
    ...bandSections,
    section('Cover', el('p', 'hint', 'The cover page is edited in the text of the stylesheet.')),
  );

  function update(): void {
    const template = [...(current?.stylesheet.pageTemplates ?? [])].find(
      ([name]) => name === current?.name,
    )?.[1];
    if (current === undefined || template === undefined) return;
    for (const apply of updates) apply(template, current.stylesheet);
  }

  return {
    show(entry, stylesheet) {
      if (entry?.kind !== 'page-template') {
        current = undefined;
        root.hidden = true;
        return false;
      }
      current = { name: entry.name, stylesheet };
      root.hidden = false;
      update();
      return true;
    },
    refused(message) {
      status.textContent = message;
      update();
    },
  };
}
