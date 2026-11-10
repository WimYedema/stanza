import type { Border, LineSpacing, PropertyType, StyleName } from '@phrase/core';
import type { Value } from '../shared/styles-protocol.js';
import { el, option } from './styles-dom.js';
import {
  LINE_SPACING_RULES,
  colorText,
  numberFrom,
  titleOf,
  type PropertyState,
} from './styles-properties.js';

/** The controls of the style panel (ADR 0037), one for each type of property. */

/** A change of a value, or `null` to take the property off. */
export type Commit = (value: Value | null) => void;

export interface Control {
  readonly node: HTMLElement;
  /**
   * Shows what the style sets itself and, in its place, what it has from a base. The file is the
   * truth, so the control is overwritten even when it has the focus (after an undo, say).
   */
  show(own: unknown, inherited: string | undefined): void;
}

const inheritedLabel = (inherited: string | undefined): string =>
  inherited === undefined ? '(not set)' : `(from base: ${inherited})`;

export function numberControl(
  type: Extract<PropertyType, { kind: 'number' }>,
  commit: Commit,
): Control {
  const input = el('input');
  input.type = 'number';
  input.step = 'any';
  if (type.range !== 'any') input.min = '0';
  input.addEventListener('change', () => {
    const value = numberFrom(input.value);
    if (value !== undefined) commit(value);
  });
  const node = el('span', 'control');
  node.append(input, el('span', 'unit', type.unit));
  return {
    node,
    show(own, inherited) {
      input.value = typeof own === 'number' ? String(own) : '';
      input.placeholder = inherited ?? '';
    },
  };
}

/** A list of words to choose from, where the first option is for what the style does not set. */
export function selectControl(
  choices: readonly { readonly value: string; readonly text: string }[],
  toValue: (chosen: string) => Value,
  commit: Commit,
  own: (value: unknown) => string,
): Control {
  const select = el('select');
  const none = option('', '');
  select.append(none, ...choices.map((choice) => option(choice.value, choice.text)));
  select.addEventListener('change', () => {
    commit(select.value === '' ? null : toValue(select.value));
  });
  return {
    node: select,
    show(value, inherited) {
      none.textContent = inheritedLabel(inherited);
      select.value = value === undefined ? '' : own(value);
    },
  };
}

export const booleanControl = (commit: Commit): Control =>
  selectControl(
    [
      { value: 'true', text: 'Yes' },
      { value: 'false', text: 'No' },
    ],
    (chosen) => chosen === 'true',
    commit,
    String,
  );

export const choiceControl = (values: readonly string[], commit: Commit): Control =>
  selectControl(
    values.map((value) => ({ value, text: titleOf(value) })),
    (chosen) => chosen,
    commit,
    String,
  );

/** A line of text, with the names of tokens to offer when a list is given. */
export function textControl(
  commit: Commit,
  format: (own: unknown) => string,
  parse: (text: string) => Value | null,
  list?: string,
): Control {
  const input = el('input');
  input.type = 'text';
  if (list !== undefined) input.setAttribute('list', list);
  input.addEventListener('change', () => {
    commit(parse(input.value));
  });
  return {
    node: input,
    show(own, inherited) {
      input.value = own === undefined ? '' : format(own);
      input.placeholder = inherited ?? '';
    },
  };
}

export function lineSpacingControl(commit: Commit): Control {
  const rules = el('select');
  const none = option('', '');
  rules.append(none, ...LINE_SPACING_RULES.map((rule) => option(rule.rule, rule.title)));
  const amount = el('input');
  amount.type = 'number';
  amount.step = 'any';
  amount.min = '0';
  const send = (): void => {
    const rule = LINE_SPACING_RULES.find((candidate) => candidate.rule === rules.value);
    if (rule === undefined) {
      commit(null);
      return;
    }
    const typed = numberFrom(amount.value);
    commit({ [rule.rule]: typeof typed === 'number' ? typed : rule.start });
  };
  rules.addEventListener('change', send);
  amount.addEventListener('change', () => {
    if (rules.value !== '') send();
  });
  const node = el('span', 'control');
  node.append(rules, amount);
  return {
    node,
    show(own, inherited) {
      none.textContent = inheritedLabel(inherited);
      const spacing = own as LineSpacing | undefined;
      rules.value = spacing?.rule ?? '';
      amount.value =
        spacing === undefined
          ? ''
          : String(spacing.rule === 'multiple' ? spacing.factor : spacing.pt);
    },
  };
}

/** The names of styles to be based on: the options are drawn again each time they are shown. */
export function styleNameControl(names: () => readonly StyleName[], commit: Commit): Control {
  const select = el('select');
  select.addEventListener('change', () => {
    commit(select.value === '' ? null : select.value);
  });
  return {
    node: select,
    show(own, inherited) {
      select.replaceChildren(
        option('', inherited === undefined ? '(none)' : inheritedLabel(inherited)),
        ...names().map((name) => option(name, name)),
      );
      select.value = typeof own === 'string' ? own : '';
    },
  };
}

export interface Row {
  readonly node: HTMLElement;
  update(): void;
}

/** A property: its title, its control, a button that takes it off, and where it comes from. */
export function row(
  title: string,
  control: Control,
  read: () => PropertyState,
  inheritedText: (value: unknown) => string,
  reset: () => void,
): Row {
  const node = el('div', 'row');
  const name = el('label', 'title', title);
  const button = el('button', 'reset', '\u00d7');
  button.type = 'button';
  button.title = 'Take this property off the style';
  button.addEventListener('click', reset);
  const note = el('span', 'note');
  node.append(name, control.node, button, note);
  return {
    node,
    update() {
      const state = read();
      const text = state.inherited === undefined ? undefined : inheritedText(state.inherited.value);
      control.show(state.own, text);
      button.hidden = state.own === undefined;
      note.textContent =
        state.own === undefined && state.inherited !== undefined
          ? `from ${state.inherited.from}`
          : '';
    },
  };
}

export const COLORS = 'phrase-colors';

const DEFAULT_BORDER = { width: 0.75, color: '#000000' };

/**
 * A border is one unit in the file, so both its width and its color are always written. A border
 * that the style has is taken off by emptying a field or by a width of 0; a missing half of a new
 * border comes from the base or from a default.
 */
export function borderControl(commit: Commit, fallback: () => Border | undefined): Control {
  let has = false;
  const width = el('input');
  width.type = 'number';
  width.step = 'any';
  width.min = '0';
  const color = el('input');
  color.type = 'text';
  color.setAttribute('list', COLORS);
  const send = (): void => {
    const typed = numberFrom(width.value);
    const chosen = color.value.trim();
    if (typed === undefined) return;
    const incomplete = typed === null || chosen === '';
    const empty = typed === null && chosen === '';
    if (typed === 0 || empty || (incomplete && has)) {
      commit(null);
      return;
    }
    const inherited = fallback();
    commit({
      width: typed ?? inherited?.widthPt ?? DEFAULT_BORDER.width,
      color:
        chosen || (inherited === undefined ? DEFAULT_BORDER.color : colorText(inherited.color)),
    });
  };
  width.addEventListener('change', send);
  color.addEventListener('change', send);
  const node = el('span', 'control');
  node.append(width, el('span', 'unit', 'pt'), color);
  return {
    node,
    show(own) {
      const border = own as Border | undefined;
      has = border !== undefined;
      const inherited = fallback();
      width.value = border === undefined ? '' : String(border.widthPt);
      color.value = border === undefined ? '' : colorText(border.color);
      width.placeholder = inherited === undefined ? '' : String(inherited.widthPt);
      color.placeholder = inherited === undefined ? '' : colorText(inherited.color);
    },
  };
}
