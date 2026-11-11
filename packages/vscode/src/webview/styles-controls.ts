import type { Border, LineSpacing, PropertyType, StyleName, Tokens } from '@phrase/core';
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
  /** Where the value comes from, when it is not the style or a base: the theme token. */
  origin?(own: unknown): string | undefined;
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

/** A line of text. */
export function textControl(
  commit: Commit,
  format: (own: unknown) => string,
  parse: (text: string) => Value | null,
): Control {
  const input = el('input');
  input.type = 'text';
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

export type TokenKind = 'color' | 'font';

/** Shows a token in the Theme tab. */
export type OpenToken = (kind: TokenKind, name: string) => void;

const CUSTOM = '\u0000custom';

/** A font as CSS: every family quoted, so that no name can end the declaration. */
const cssFamilies = (families: readonly string[]): string =>
  families.map((family) => JSON.stringify(family)).join(', ');

interface TokenPicker {
  readonly node: HTMLElement;
  show(own: unknown, inherited: string | undefined): void;
}

/**
 * A list of the theme's tokens with a swatch or a font sample. A value that is not a token of the
 * theme is shown as "Custom" with a warning, until a token is picked (ADR 0066).
 */
function tokenPicker(
  kind: TokenKind,
  tokens: () => Tokens,
  pick: (name: string | null) => void,
  open: OpenToken,
): TokenPicker {
  const select = el('select');
  const sample = kind === 'color' ? el('span', 'swatch') : el('span', 'sample', 'Aa');
  const link = el('button', 'token-link', '\u2192');
  link.type = 'button';
  let target: string | undefined;
  link.addEventListener('click', () => {
    if (target !== undefined) open(kind, target);
  });
  const warning = el('span', 'warning', 'Not a token of the theme. Pick one.');
  const node = el('span', 'control tokens');
  node.append(select, sample, link, warning);
  select.addEventListener('change', () => {
    if (select.value !== CUSTOM) pick(select.value === '' ? null : select.value);
  });
  const names = (): readonly string[] => [
    ...tokens()[kind === 'color' ? 'colors' : 'fonts'].keys(),
  ];
  const tokenName = (value: unknown): string | undefined => {
    const token = value as { kind?: unknown; name?: unknown } | string | undefined;
    if (typeof token === 'string') return token;
    return token?.kind === 'token' && typeof token.name === 'string' ? token.name : undefined;
  };
  return {
    node,
    show(own, inherited) {
      const known = names();
      const chosen = tokenName(own);
      const custom = own !== undefined && (chosen === undefined || !known.includes(chosen));
      select.replaceChildren(
        option('', inheritedLabel(inherited)),
        ...(custom ? [option(CUSTOM, 'Custom')] : []),
        ...known.map((name) => option(name, name)),
      );
      select.value = own === undefined ? '' : custom ? CUSTOM : (chosen ?? '');
      warning.hidden = !custom;
      const shown = own === undefined ? inherited : chosen;
      target = shown !== undefined && !custom && known.includes(shown) ? shown : undefined;
      link.hidden = target === undefined;
      link.title = target === undefined ? '' : `Show the token ${target} in the Theme tab`;
      link.setAttribute('aria-label', link.title);
      if (kind === 'color') {
        sample.style.background = shown === undefined ? '' : (tokens().colors.get(shown) ?? '');
      } else {
        const families = shown === undefined ? undefined : tokens().fonts.get(shown);
        sample.style.fontFamily = families === undefined ? '' : cssFamilies(families);
      }
    },
  };
}

export function tokenControl(
  kind: TokenKind,
  tokens: () => Tokens,
  commit: Commit,
  open: OpenToken,
): Control {
  const picker = tokenPicker(kind, tokens, commit, open);
  return {
    node: picker.node,
    show(own, inherited) {
      picker.show(own, inherited);
    },
    origin(own) {
      const known = tokens()[kind === 'color' ? 'colors' : 'fonts'];
      const name = (own as { name?: unknown } | undefined)?.name;
      return typeof name === 'string' && known.has(name) ? `Theme: ${name}` : undefined;
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
      const parts: string[] = [];
      if (state.own === undefined && state.inherited !== undefined) {
        parts.push(`from ${state.inherited.from}`);
      }
      const origin = control.origin?.(state.own ?? state.inherited?.value);
      if (origin !== undefined) parts.push(origin);
      note.textContent = parts.join(' \u00b7 ');
    },
  };
}

const DEFAULT_BORDER_WIDTH = 0.75;

/**
 * A border is one unit in the file, so both its width and its color are always written. A border
 * that the style has is taken off by emptying a field or by a width of 0; a missing half of a new
 * border comes from the base, and a missing color from the first color token.
 */
export function borderControl(
  commit: Commit,
  fallback: () => Border | undefined,
  tokens: () => Tokens,
  open: OpenToken,
): Control {
  let has = false;
  let chosen = '';
  const width = el('input');
  width.type = 'number';
  width.step = 'any';
  width.min = '0';
  const send = (): void => {
    const typed = numberFrom(width.value);
    if (typed === undefined) return;
    const incomplete = typed === null || chosen === '';
    const empty = typed === null && chosen === '';
    if (typed === 0 || empty || (incomplete && has)) {
      commit(null);
      return;
    }
    const inherited = fallback();
    const color =
      chosen ||
      (inherited === undefined ? [...tokens().colors.keys()][0] : colorText(inherited.color));
    if (color === undefined) return;
    commit({ width: typed ?? inherited?.widthPt ?? DEFAULT_BORDER_WIDTH, color });
  };
  const picker = tokenPicker(
    'color',
    tokens,
    (name) => {
      chosen = name ?? '';
      send();
    },
    open,
  );
  width.addEventListener('change', send);
  const node = el('span', 'control');
  node.append(width, el('span', 'unit', 'pt'), picker.node);
  return {
    node,
    show(own) {
      const border = own as Border | undefined;
      has = border !== undefined;
      const inherited = fallback();
      chosen = border === undefined ? '' : colorText(border.color);
      width.value = border === undefined ? '' : String(border.widthPt);
      width.placeholder = inherited === undefined ? '' : String(inherited.widthPt);
      picker.show(border?.color, inherited === undefined ? undefined : colorText(inherited.color));
    },
  };
}
