import { isStyleName, type Stylesheet } from '@phrase/core';
import type { StyleKind, StylesWebviewMessage } from '../shared/styles-protocol.js';
import { el, option, simpleRow as row, simpleSection as section } from './styles-dom.js';
import type { Family } from './styles-families.js';

/**
 * The form for a new style under the list (ADR 0053): a name and the style it is based on. It is
 * there for the families that people add to. The headings and the list styles are the ones that
 * every stylesheet has, and a style is never renamed, since documents refer to it by name.
 */

const KIND_OF: Partial<Record<Family, StyleKind>> = {
  paragraphs: 'paragraph-style',
  characters: 'character-style',
  tables: 'table-style',
};

const WORD_OF: Record<StyleKind, string> = {
  'paragraph-style': 'paragraph',
  'character-style': 'character',
  'table-style': 'table',
};

/** The style that a new one is based on unless the person chooses another. */
const DEFAULT_BASE: Partial<Record<StyleKind, string>> = {
  'paragraph-style': 'body',
  'table-style': 'table',
};

export interface AddPanelOptions {
  readonly root: HTMLElement;
  readonly send: (message: StylesWebviewMessage) => void;
  /** Called when a style was asked for, so that it can be selected once it is in the stylesheet. */
  readonly added: (kind: StyleKind, name: string) => void;
}

export interface AddPanel {
  /** Shows the form for the families that have one, and hides it for the others. */
  show(family: Family, stylesheet: Stylesheet): void;
  /** A change was refused: says why, if it was the asking for a style. */
  refused(message: string): void;
}

const stylesOf = (stylesheet: Stylesheet, kind: StyleKind) =>
  kind === 'paragraph-style'
    ? stylesheet.paragraphStyles
    : kind === 'character-style'
      ? stylesheet.characterStyles
      : stylesheet.tableStyles;

export function createAddPanel({ root, send, added }: AddPanelOptions): AddPanel {
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  const name = el('input');
  name.type = 'text';
  name.placeholder = 'name-in-kebab-case';
  const base = el('select');
  const button = el('button', undefined, 'Add style');
  button.type = 'button';
  root.append(
    status,
    section('New style', row('Name', name), row('Based on', base), row('', button)),
  );

  let current: { readonly kind: StyleKind; readonly stylesheet: Stylesheet } | undefined;
  let shownFamily: Family | undefined;
  let pending: string | undefined;

  button.addEventListener('click', () => {
    if (current === undefined) return;
    const { kind, stylesheet } = current;
    const chosen = name.value.trim();
    if (!isStyleName(chosen)) {
      status.textContent = 'A style name is in kebab-case, such as note or warning-note.';
      return;
    }
    if (stylesOf(stylesheet, kind).has(chosen)) {
      status.textContent = `There is a ${WORD_OF[kind]} style ${chosen} already.`;
      return;
    }
    status.textContent = '';
    pending = chosen;
    added(kind, chosen);
    send({
      type: 'add-style',
      kind,
      name: chosen,
      ...(base.value === '' ? {} : { basedOn: base.value }),
    });
  });

  return {
    show(family, stylesheet) {
      const kind = KIND_OF[family];
      root.hidden = kind === undefined;
      if (kind === undefined) {
        current = undefined;
        shownFamily = undefined;
        return;
      }
      current = { kind, stylesheet };
      const names = [...stylesOf(stylesheet, kind).keys()];
      const keep =
        shownFamily === family && names.some((each) => each === base.value) ? base.value : '';
      base.replaceChildren(option('', '(none)'), ...names.map((each) => option(each, each)));
      base.value = shownFamily === family ? keep : (DEFAULT_BASE[kind] ?? '');
      shownFamily = family;
      if (pending !== undefined && names.some((each) => each === pending)) {
        pending = undefined;
        name.value = '';
        status.textContent = '';
      }
    },
    refused(message) {
      if (pending === undefined) return;
      pending = undefined;
      status.textContent = message;
    },
  };
}
