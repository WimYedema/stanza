import {
  PARAGRAPH_PROPERTIES,
  TEXT_PROPERTIES,
  VARIANT_MARKS,
  propertiesAt,
  type Border,
  type LineSpacing,
  type PropertyPlace,
  type PropertyType,
  type StyleName,
  type Stylesheet,
  type TableStyle,
  type VariantMark,
} from '@phrase/core';
import { DEFAULT_VARIANTS } from '@phrase/format';
import type { StylesWebviewMessage, Value } from '../shared/styles-protocol.js';
import type { Entry, Family } from './styles-families.js';
import { el, option } from './styles-dom.js';
import { paragraphGroups } from './styles-groups.js';
import {
  LINE_SPACING_RULES,
  borderText,
  colorText,
  fontFrom,
  numberFrom,
  stateBy,
  stateOf,
  titleOf,
  valueText,
  variantStateOf,
  type Group,
  type PropertyState,
  type StyleLike,
} from './styles-properties.js';

/**
 * The panel of a paragraph style (ADR 0037): a control for each property, chosen by the type in the
 * list of properties, that shows whether the style sets the property itself or has it from a base,
 * and sends a change as a message for the host to make in the text of the stylesheet.
 */

/** A change of a value, or `null` to take the property off. */
type Commit = (value: Value | null) => void;

type StyleKind = 'paragraph-style' | 'character-style' | 'table-style';

interface Control {
  readonly node: HTMLElement;
  /**
   * Shows what the style sets itself and, in its place, what it has from a base. The file is the
   * truth, so the control is overwritten even when it has the focus (after an undo, say).
   */
  show(own: unknown, inherited: string | undefined): void;
}

const inheritedLabel = (inherited: string | undefined): string =>
  inherited === undefined ? '(not set)' : `(from base: ${inherited})`;

function numberControl(type: Extract<PropertyType, { kind: 'number' }>, commit: Commit): Control {
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
function selectControl(
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

const booleanControl = (commit: Commit): Control =>
  selectControl(
    [
      { value: 'true', text: 'Yes' },
      { value: 'false', text: 'No' },
    ],
    (chosen) => chosen === 'true',
    commit,
    String,
  );

const choiceControl = (values: readonly string[], commit: Commit): Control =>
  selectControl(
    values.map((value) => ({ value, text: titleOf(value) })),
    (chosen) => chosen,
    commit,
    String,
  );

/** A line of text, with the names of tokens to offer when a list is given. */
function textControl(
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

function lineSpacingControl(commit: Commit): Control {
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
function styleNameControl(names: () => readonly StyleName[], commit: Commit): Control {
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

interface Row {
  readonly node: HTMLElement;
  update(): void;
}

/** A property: its title, its control, a button that takes it off, and where it comes from. */
function row(
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

export interface PanelOptions {
  readonly root: HTMLElement;
  readonly send: (message: StylesWebviewMessage) => void;
}

export interface Panel {
  /**
   * Shows a paragraph, character or table style, or hides the panel for anything else, and says
   * whether it is shown. The same style is updated in place.
   */
  show(entry: Entry | undefined, stylesheet: Stylesheet): boolean;
  /** A change was refused: says why, and shows the stylesheet as it is. */
  refused(message: string): void;
}

const COLORS = 'phrase-colors';
const FONTS = 'phrase-fonts';

const DEFAULT_BORDER = { width: 0.75, color: '#000000' };

/**
 * A border is one unit in the file, so both its width and its color are always written. A border
 * that the style has is taken off by emptying a field or by a width of 0; a missing half of a new
 * border comes from the base or from a default.
 */
function borderControl(commit: Commit, fallback: () => Border | undefined): Control {
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

export function createPanel({ root, send }: PanelOptions): Panel {
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  const colors = el('datalist');
  colors.id = COLORS;
  const fonts = el('datalist');
  fonts.id = FONTS;
  let current:
    | {
        readonly stylesheet: Stylesheet;
        readonly name: StyleName;
        readonly family: Family;
        readonly kind: StyleKind;
      }
    | undefined;
  let built: string | undefined;
  /** Which groups are open, kept when another style is selected. */
  const openStates = new Map<string, boolean>();
  let rows: Row[] = [];
  let variants: { readonly mark: VariantMark; readonly node: HTMLElement }[] = [];

  const path = (...keys: string[]): string[] => [
    current === undefined ? '' : `${current.kind}s`,
    current?.name ?? '',
    ...keys,
  ];
  const change =
    (at: string[]): Commit =>
    (value) => {
      status.textContent = '';
      send(value === null ? { type: 'unset', path: at } : { type: 'set', path: at, value });
    };
  const styles = (): ReadonlyMap<StyleName, StyleLike> =>
    current?.kind === 'character-style'
      ? current.stylesheet.characterStyles
      : (current?.stylesheet.paragraphStyles ?? new Map());
  const named = (): ReadonlyMap<StyleName, { basedOn?: StyleName; label?: string }> => {
    if (current === undefined) return new Map();
    const sheet = current.stylesheet;
    if (current.kind === 'table-style') return sheet.tableStyles;
    return current.kind === 'character-style' ? sheet.characterStyles : sheet.paragraphStyles;
  };
  const style = () => (current === undefined ? undefined : named().get(current.name));
  const paragraphStyle = () =>
    current?.kind === 'paragraph-style'
      ? current.stylesheet.paragraphStyles.get(current.name)
      : undefined;

  function controlOf(type: PropertyType, commit: Commit): Control {
    switch (type.kind) {
      case 'number':
        return numberControl(type, commit);
      case 'boolean':
        return booleanControl(commit);
      case 'choice':
        return choiceControl(type.values, commit);
      case 'color':
        return textControl(
          commit,
          (own) => valueText(type, own),
          (text) => text.trim() || null,
          COLORS,
        );
      case 'font':
        return textControl(commit, (own) => valueText(type, own), fontFrom, FONTS);
      case 'line-spacing':
        return lineSpacingControl(commit);
      case 'style-name':
        return styleNameControl(
          () => [...(current?.stylesheet.paragraphStyles.keys() ?? [])],
          commit,
        );
      default:
        return textControl(commit, String, (text) => text.trim() || null);
    }
  }

  function propertyRow(
    key: string,
    type: PropertyType,
    at: string[],
    read: () => PropertyState,
  ): Row {
    const commit = change(at);
    return row(
      titleOf(key),
      controlOf(type, commit),
      read,
      (value) => valueText(type, value),
      () => {
        commit(null);
      },
    );
  }

  function disclosure(
    key: string,
    defaultOpen: boolean,
    title: string,
    className?: string,
  ): HTMLDetailsElement {
    const node = el('details', className);
    node.open = openStates.get(key) ?? defaultOpen;
    node.addEventListener('toggle', () => {
      openStates.set(key, node.open);
    });
    node.append(el('summary', undefined, title));
    return node;
  }

  function section(title: string, hint: string | undefined, ...parts: HTMLElement[]): HTMLElement {
    const node = el('section');
    const group = disclosure(title, true, title);
    if (hint !== undefined) group.append(el('p', 'hint', hint));
    group.append(...parts);
    node.append(group);
    return node;
  }

  function tableSections(add: (target: HTMLElement[], made: Row) => void): HTMLElement[] {
    const state = (read: (style: TableStyle) => unknown) => (): PropertyState =>
      current === undefined
        ? { own: undefined, inherited: undefined }
        : stateBy(current.stylesheet.tableStyles, current.name, read);
    const typeOf = (place: PropertyPlace, key: string): PropertyType => {
      const found = propertiesAt(place).find((property) => property.key === key);
      if (found === undefined) throw new Error(`There is no property ${key} at ${place}.`);
      return found.type;
    };

    const table: HTMLElement[] = [];
    add(
      table,
      propertyRow(
        'cell-style',
        typeOf('table-style', 'cell-style'),
        path('cell-style'),
        state((style) => style.cellStyle),
      ),
    );
    add(
      table,
      propertyRow(
        'cell-padding',
        typeOf('table-style', 'cell-padding'),
        path('cell-padding'),
        state((style) => style.cellPaddingPt),
      ),
    );

    const borders: HTMLElement[] = [];
    const sides = [
      ['outer', 'outer'],
      ['inside-horizontal', 'insideHorizontal'],
      ['inside-vertical', 'insideVertical'],
    ] as const;
    for (const [key, field] of sides) {
      const commit = change(path('border', key));
      const read = state((style) => style.border?.[field]);
      add(
        borders,
        row(
          titleOf(key),
          borderControl(commit, () => read().inherited?.value as Border | undefined),
          read,
          (value) => borderText(value as Border),
          () => {
            commit(null);
          },
        ),
      );
    }

    const header: HTMLElement[] = [];
    add(
      header,
      propertyRow(
        'background',
        typeOf('header-row', 'background'),
        path('header-row', 'background'),
        state((style) => style.headerRow?.background),
      ),
    );
    add(
      header,
      propertyRow(
        'repeat',
        typeOf('header-row', 'repeat'),
        path('header-row', 'repeat'),
        state((style) => style.headerRow?.repeat),
      ),
    );
    const headerText = disclosure('Header row text', false, 'Text', 'subgroup');
    const headerTextRows: HTMLElement[] = [];
    for (const { key, prop, type } of TEXT_PROPERTIES) {
      add(
        headerTextRows,
        propertyRow(
          key,
          type,
          path('header-row', key),
          state((style) => style.headerRow?.text[prop]),
        ),
      );
    }
    headerText.append(...headerTextRows);
    header.push(headerText);

    return [
      section('Table', undefined, ...table),
      section(
        'Borders',
        'A border is set as a whole, with its width and color. Empty a field, or set the width to 0, to take it off. A style based on another replaces the border of its base, not a part of it.',
        ...borders,
      ),
      section(
        'Header row',
        'The text of the header row adds to the text of the cell style. Each property can be set on its own.',
        ...header,
      ),
    ];
  }

  function build(): void {
    const sections: HTMLElement[] = [];
    rows = [];
    variants = [];
    const add = (target: HTMLElement[], made: Row): void => {
      rows.push(made);
      target.push(made.node);
    };
    const read = (group: Group, prop: string) => (): PropertyState =>
      current === undefined
        ? { own: undefined, inherited: undefined }
        : stateOf(styles(), current.name, group, prop);

    const identity: HTMLElement[] = [];
    const labelCommit = change(path('label'));
    add(
      identity,
      row(
        'Label',
        textControl(labelCommit, String, (text) => text.trim() || null),
        () => ({ own: style()?.label, inherited: undefined }),
        String,
        () => {
          labelCommit(null);
        },
      ),
    );
    const baseCommit = change(path('based-on'));
    add(
      identity,
      row(
        'Based on',
        styleNameControl(() => [...named().keys()].filter((n) => n !== current?.name), baseCommit),
        () => ({ own: style()?.basedOn, inherited: undefined }),
        String,
        () => {
          baseCommit(null);
        },
      ),
    );
    sections.push(section('Style', undefined, ...identity));

    if (current?.kind === 'table-style') {
      sections.push(...tableSections(add));
      root.replaceChildren(status, colors, fonts, ...sections);
      return;
    }

    const text: HTMLElement[] = [];
    for (const { key, prop, type } of TEXT_PROPERTIES) {
      add(text, propertyRow(key, type, path(key), read('text', prop)));
    }
    sections.push(section('Text', undefined, ...text));

    if (current?.kind === 'character-style') {
      root.replaceChildren(status, colors, fonts, ...sections);
      return;
    }

    for (const { title, hint, keys } of paragraphGroups(current?.family ?? 'paragraphs')) {
      const rowsOfGroup: HTMLElement[] = [];
      for (const key of keys) {
        const found = PARAGRAPH_PROPERTIES.find((property) => property.key === key);
        if (found === undefined) continue;
        add(rowsOfGroup, propertyRow(key, found.type, path(key), read('paragraph', found.prop)));
      }
      sections.push(section(title, hint, ...rowsOfGroup));
    }

    variants = [];
    const marks: HTMLElement[] = [];
    for (const mark of VARIANT_MARKS) {
      const at = path('variants', mark);
      const commit = change(at);
      const select = selectControl(
        [
          { value: 'allow', text: 'Allowed' },
          { value: 'off', text: 'Not allowed' },
        ],
        (chosen) => (chosen === 'allow' ? DEFAULT_VARIANTS[mark] : false),
        commit,
        (value) => (value === null ? 'off' : 'allow'),
      );
      const holder = row(
        titleOf(mark),
        select,
        () =>
          current === undefined
            ? { own: undefined, inherited: undefined }
            : variantStateOf(current.stylesheet, current.name, mark),
        (value) => (value === null ? 'not allowed' : 'allowed'),
        () => {
          commit(null);
        },
      );
      const details = disclosure(`mark:${mark}`, false, `Properties of ${mark}`, 'variant');
      for (const { key, prop, type } of TEXT_PROPERTIES) {
        const inner = propertyRow(key, type, path('variants', mark, key), () => ({
          own: paragraphStyle()?.variants[mark]?.[prop],
          inherited: undefined,
        }));
        rows.push(inner);
        details.append(inner.node);
      }
      variants.push({ mark, node: details });
      rows.push(holder);
      marks.push(holder.node, details);
    }
    sections.push(section('Marks', undefined, ...marks));

    root.replaceChildren(status, colors, fonts, ...sections);
  }

  function update(): void {
    const tokens = current?.stylesheet.tokens;
    colors.replaceChildren(...[...(tokens?.colors.keys() ?? [])].map((name) => option(name, '')));
    fonts.replaceChildren(...[...(tokens?.fonts.keys() ?? [])].map((name) => option(name, '')));
    for (const made of rows) made.update();
    for (const { mark, node } of variants) {
      const declared = paragraphStyle()?.variants[mark];
      node.hidden = declared === undefined || declared === null;
    }
  }

  return {
    show(entry, stylesheet) {
      if (
        entry?.kind !== 'paragraph-style' &&
        entry?.kind !== 'character-style' &&
        entry?.kind !== 'table-style'
      ) {
        current = undefined;
        built = undefined;
        root.hidden = true;
        return false;
      }
      current = {
        stylesheet,
        name: entry.name as StyleName,
        family: entry.family,
        kind: entry.kind,
      };
      const key = `${entry.kind}:${entry.family}:${entry.name}`;
      if (built !== key) {
        build();
        built = key;
      }
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
