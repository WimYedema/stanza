import { isStyleName, type Stylesheet } from '@phrase/core';
import type { StylesWebviewMessage, Value } from '../shared/styles-protocol.js';
import type { Entry, Family } from './styles-families.js';

/**
 * The theme tab of the style editor (ADR 0050): the value of the selected color or font token, and
 * a form for a new token. Changes go to the host as edits of the text of the stylesheet. A token is
 * never renamed or removed here, since styles refer to tokens by name.
 */

const HEX = /^#[0-9a-f]{6}$/i;

type Kind = 'color' | 'font';

const KEYS: Record<Kind, 'colors' | 'fonts'> = { color: 'colors', font: 'fonts' };

export interface ThemePanelOptions {
  readonly root: HTMLElement;
  readonly send: (message: StylesWebviewMessage) => void;
}

export interface ThemePanel {
  /**
   * Shows the editor of the selected token and the form for a new one, or hides the panel when the
   * Theme tab is not the one shown, and says whether it is shown.
   */
  show(entry: Entry | undefined, family: Family, stylesheet: Stylesheet): boolean;
  /** A change was refused: says why, and shows the stylesheet as it is. */
  refused(message: string): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

/** The families of a typed list, or undefined for none. */
function familiesFrom(text: string): readonly string[] | undefined {
  const families = text
    .split(',')
    .map((family) => family.trim())
    .filter((family) => family !== '');
  return families.length === 0 ? undefined : families;
}

function section(title: string, ...parts: HTMLElement[]): HTMLElement {
  const node = el('section');
  const group = el('details');
  group.open = true;
  group.append(el('summary', undefined, title), ...parts);
  node.append(group);
  return node;
}

function row(title: string, ...controls: HTMLElement[]): HTMLElement {
  const node = el('div', 'row');
  const control = el('span', 'control');
  control.append(...controls);
  node.append(el('label', 'title', title), control);
  return node;
}

export function createThemePanel({ root, send }: ThemePanelOptions): ThemePanel {
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  let selected: { readonly kind: Kind; readonly name: string } | undefined;
  let stylesheet: Stylesheet | undefined;

  const set = (kind: Kind, name: string, value: Value): void => {
    status.textContent = '';
    send({ type: 'set', path: ['tokens', KEYS[kind], name], value });
  };

  const swatch = el('input');
  swatch.type = 'color';
  const colorText = el('input');
  colorText.type = 'text';
  const colorRow = row('Value', swatch, colorText);
  const families = el('input');
  families.type = 'text';
  const fontRow = row('Families', families);

  const setColor = (text: string): void => {
    if (selected?.kind !== 'color') return;
    if (HEX.test(text.trim())) set('color', selected.name, text.trim().toUpperCase());
    else {
      status.textContent = 'A color is written as #RRGGBB.';
      refresh();
    }
  };
  swatch.addEventListener('change', () => {
    setColor(swatch.value);
  });
  colorText.addEventListener('change', () => {
    setColor(colorText.value);
  });
  families.addEventListener('change', () => {
    if (selected?.kind !== 'font') return;
    const typed = familiesFrom(families.value);
    if (typed === undefined) {
      status.textContent = 'A font needs at least one family.';
      refresh();
    } else {
      set('font', selected.name, typed);
    }
  });

  const current = el('section');
  current.append(colorRow, fontRow);

  const kind = el('select');
  for (const [value, text] of [
    ['color', 'Color'],
    ['font', 'Font'],
  ] as const) {
    const option = el('option', undefined, text);
    option.value = value;
    kind.append(option);
  }
  const name = el('input');
  name.type = 'text';
  name.placeholder = 'name-in-kebab-case';
  const value = el('input');
  value.type = 'text';
  const add = el('button', undefined, 'Add token');
  add.type = 'button';
  const kindOfForm = (): Kind => (kind.value === 'font' ? 'font' : 'color');
  const hint = (): void => {
    value.placeholder = kindOfForm() === 'color' ? '#RRGGBB' : 'Calibri, Arial';
  };
  kind.addEventListener('change', hint);
  hint();
  add.addEventListener('click', () => {
    const chosen = kindOfForm();
    const token = name.value.trim();
    if (!isStyleName(token)) {
      status.textContent = 'A token name is in kebab-case, such as brand or body-text.';
      return;
    }
    if (stylesheet?.tokens[KEYS[chosen]].has(token) === true) {
      status.textContent = `There is a ${chosen} token ${token} already.`;
      return;
    }
    if (chosen === 'color') {
      if (!HEX.test(value.value.trim())) {
        status.textContent = 'A color is written as #RRGGBB.';
        return;
      }
      set('color', token, value.value.trim().toUpperCase());
      return;
    }
    const typed = familiesFrom(value.value);
    if (typed === undefined) {
      status.textContent = 'A font needs at least one family.';
      return;
    }
    set('font', token, typed);
  });
  const form = row('New', kind, name, value, add);

  const tokenSection = section('Token', current);
  root.append(
    status,
    tokenSection,
    section(
      'New token',
      el(
        'p',
        'hint',
        'Tokens are not renamed or removed here, since styles refer to them by name.',
      ),
      form,
    ),
  );

  function refresh(): void {
    if (stylesheet === undefined) return;
    if (selected?.kind === 'color') {
      const hex = stylesheet.tokens.colors.get(selected.name) ?? '';
      colorText.value = hex;
      if (HEX.test(hex)) swatch.value = hex.toLowerCase();
    } else if (selected?.kind === 'font') {
      families.value = (stylesheet.tokens.fonts.get(selected.name) ?? []).join(', ');
    }
    // A token that is there now was added from the form.
    if (stylesheet.tokens[KEYS[kindOfForm()]].has(name.value.trim())) {
      name.value = '';
      value.value = '';
    }
  }

  return {
    show(entry, family, next) {
      if (family !== 'theme') {
        root.hidden = true;
        selected = undefined;
        return false;
      }
      stylesheet = next;
      selected =
        entry?.kind === 'color' || entry?.kind === 'font'
          ? { kind: entry.kind, name: entry.name }
          : undefined;
      tokenSection.hidden = selected === undefined;
      colorRow.hidden = selected?.kind !== 'color';
      fontRow.hidden = selected?.kind !== 'font';
      root.hidden = false;
      refresh();
      return true;
    },
    refused(message) {
      status.textContent = message;
      refresh();
    },
  };
}
