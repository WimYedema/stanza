import {
  PARAGRAPH_PROPERTIES,
  TEXT_PROPERTIES,
  VARIANT_MARKS,
  isReservedStyle,
  propertiesAt,
  type Border,
  type PropertyPlace,
  type PropertyType,
  type StyleFamily,
  type StyleName,
  type Stylesheet,
  type TableStyle,
  type Tokens,
  type VariantMark,
} from '@phrase/core';
import { DEFAULT_VARIANTS } from '@phrase/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import type { Entry, Family } from './styles-families.js';
import { el } from './styles-dom.js';
import {
  borderControl,
  booleanControl,
  choiceControl,
  lineSpacingControl,
  numberControl,
  row,
  selectControl,
  styleNameControl,
  textControl,
  tokenControl,
  type Commit,
  type Control,
  type Row,
} from './styles-controls.js';
import { paragraphGroups } from './styles-groups.js';
import {
  borderText,
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

type StyleKind = 'paragraph-style' | 'character-style' | 'table-style';

const FAMILY_OF: Record<StyleKind, StyleFamily> = {
  'paragraph-style': 'paragraph',
  'character-style': 'character',
  'table-style': 'table',
};

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

const NO_TOKENS: Tokens = { colors: new Map(), fonts: new Map() };

export function createPanel({ root, send }: PanelOptions): Panel {
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  const themeNote = el(
    'p',
    'hint',
    'Colors and fonts come from the theme. Pick a token here; add or change tokens in the Theme tab.',
  );
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

  const tokens = (): Tokens => current?.stylesheet.tokens ?? NO_TOKENS;

  function controlOf(type: PropertyType, commit: Commit): Control {
    switch (type.kind) {
      case 'number':
        return numberControl(type, commit);
      case 'boolean':
        return booleanControl(commit);
      case 'choice':
        return choiceControl(type.values, commit);
      case 'color':
        return tokenControl('color', tokens, commit);
      case 'font':
        return tokenControl('font', tokens, commit);
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
          borderControl(commit, () => read().inherited?.value as Border | undefined, tokens),
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

    const bands: HTMLElement[] = [];
    for (const key of ['odd', 'even'] as const) {
      add(
        bands,
        propertyRow(
          key,
          typeOf('banded-rows', key),
          path('banded-rows', key),
          state((style) => style.bandedRows?.[key]),
        ),
      );
    }

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
      section(
        'Banded rows',
        'The background of the odd and the even rows of the body. The header row is not counted, so the first body row is odd.',
        ...bands,
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

    if (current !== undefined && !isReservedStyle(FAMILY_OF[current.kind], current.name)) {
      const { kind, name } = current;
      const remove = el('button', 'delete', 'Delete style');
      remove.type = 'button';
      remove.title = 'Delete this style if no document uses it and nothing refers to it';
      remove.addEventListener('click', () => {
        status.textContent = '';
        send({ type: 'delete-style', kind, name });
      });
      const holder = el('div', 'row');
      holder.append(el('span'), remove);
      identity.push(holder);
    }
    sections.push(section('Style', undefined, ...identity));
    if (current?.kind === 'table-style') {
      sections.push(...tableSections(add));
      root.replaceChildren(status, themeNote, ...sections);
      return;
    }

    const text: HTMLElement[] = [];
    for (const { key, prop, type } of TEXT_PROPERTIES) {
      add(text, propertyRow(key, type, path(key), read('text', prop)));
    }
    sections.push(section('Text', undefined, ...text));

    if (current?.kind === 'character-style') {
      root.replaceChildren(status, themeNote, ...sections);
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

    root.replaceChildren(status, themeNote, ...sections);
  }

  function update(): void {
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
