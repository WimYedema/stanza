import {
  PARAGRAPH_PROPERTIES,
  RESERVED_TABLE_STYLE,
  TEXT_PROPERTIES,
  resolveParagraphStyle,
  resolveTableStyle,
  type PropertyType,
  type StyleName,
  type Stylesheet,
} from '@phrase/core';
import type { PhraseEditor } from '@phrase/editor';
import type { UsageCount, UsageSummary } from '../shared/protocol.js';
import { el } from './styles-dom.js';
import { borderText, colorText, stateOf, titleOf, valueText } from './styles-properties.js';

/**
 * The style at the cursor, read only (ADR 0054): what the stylesheet says about it with the bases
 * applied, which documents use it, and a button that opens the style editor. It does not change
 * anything. It is drawn again when the cursor moves to another style, or the stylesheet or the
 * usage changes, and not on every key.
 */

const DRAW_DELAY_MS = 150;

export interface StyleInfoOptions {
  readonly root: HTMLElement;
  readonly editor: () => PhraseEditor | undefined;
  /** Opens the style editor. */
  readonly edit: () => void;
}

export interface StyleInfo {
  setStylesheet(stylesheet: Stylesheet): void;
  setUsage(usage: UsageSummary): void;
  /** Draws now, or hides the panel where there is no editor. */
  refresh(): void;
  /** Draws after a short pause, for the changes that come with every move of the cursor. */
  schedule(): void;
}

type Rows = readonly (readonly [string, string])[];

function definition(rows: Rows): HTMLElement {
  const list = el('dl');
  for (const [term, meaning] of rows) {
    list.append(el('dt', undefined, term), el('dd', undefined, meaning));
  }
  return list;
}

/** `a → b → body`: the style and the styles it is based on, nearest first. */
function chainOf(
  styles: ReadonlyMap<StyleName, { readonly basedOn?: StyleName }>,
  name: StyleName,
): readonly StyleName[] {
  const chain: StyleName[] = [];
  for (let next: StyleName | undefined = name; next !== undefined && !chain.includes(next);) {
    chain.push(next);
    next = styles.get(next)?.basedOn;
  }
  return chain;
}

function paragraphRows(sheet: Stylesheet, name: StyleName): Rows {
  const rows: [string, string][] = [];
  const add = (
    group: 'text' | 'paragraph',
    entry: { readonly key: string; readonly prop: string; readonly type: PropertyType },
  ): void => {
    const state = stateOf(sheet.paragraphStyles, name, group, entry.prop);
    const value = state.own ?? state.inherited?.value;
    if (value === undefined) return;
    const from =
      state.own === undefined && state.inherited !== undefined
        ? ` (from ${state.inherited.from})`
        : '';
    rows.push([titleOf(entry.key), `${valueText(entry.type, value)}${from}`]);
  };
  for (const entry of TEXT_PROPERTIES) add('text', entry);
  for (const entry of PARAGRAPH_PROPERTIES) add('paragraph', entry);
  const marks = Object.keys(resolveParagraphStyle(sheet, name)?.variants ?? {});
  rows.push(['Marks', marks.length === 0 ? 'none' : marks.join(', ')]);
  return rows;
}

function tableRows(sheet: Stylesheet, name: StyleName): Rows {
  const resolved = resolveTableStyle(sheet, name);
  if (resolved === undefined) return [];
  const rows: [string, string][] = [['Cell style', resolved.cellStyle ?? 'body']];
  if (resolved.cellPaddingPt !== undefined) {
    rows.push(['Cell padding', `${String(resolved.cellPaddingPt)} pt`]);
  }
  const { border, headerRow } = resolved;
  if (border?.outer !== undefined) rows.push(['Outer border', borderText(border.outer)]);
  if (border?.insideHorizontal !== undefined) {
    rows.push(['Inside horizontal', borderText(border.insideHorizontal)]);
  }
  if (border?.insideVertical !== undefined) {
    rows.push(['Inside vertical', borderText(border.insideVertical)]);
  }
  if (headerRow?.background !== undefined) {
    rows.push(['Header background', colorText(headerRow.background)]);
  }
  if (headerRow?.repeat !== undefined) {
    rows.push(['Header repeats', headerRow.repeat ? 'yes' : 'no']);
  }
  return rows;
}

function usageView(entries: readonly UsageCount[] | undefined, usage: UsageSummary | undefined) {
  const view = el('div', 'usage');
  if (usage === undefined) {
    view.append(el('p', undefined, 'Where it is used is not known yet.'));
    return view;
  }
  const used = (entries ?? []).filter((entry) => entry.direct + entry.default > 0);
  const blocks = used.reduce((sum, entry) => sum + entry.direct + entry.default, 0);
  const summary =
    used.length === 0
      ? 'No document uses this style itself.'
      : `Used by ${String(blocks)} block${blocks === 1 ? '' : 's'} in ${String(used.length)} document${used.length === 1 ? '' : 's'}.`;
  view.append(el('p', undefined, summary));
  if (entries === undefined || entries.length === 0) return view;
  const list = el('ul');
  for (const entry of entries) {
    const parts = [
      entry.direct > 0 ? `${String(entry.direct)} named` : undefined,
      entry.default > 0 ? `${String(entry.default)} by default` : undefined,
      entry.inherited > 0 ? `${String(entry.inherited)} through styles based on it` : undefined,
    ].filter((part) => part !== undefined);
    const here = entry.file === usage.current ? ' (this document)' : '';
    list.append(el('li', undefined, `${entry.file}${here}: ${parts.join(', ')}`));
  }
  view.append(list);
  return view;
}

const has = (record: Readonly<Record<string, readonly UsageCount[]>>, name: string) =>
  Object.hasOwn(record, name) ? record[name] : undefined;

export function createStyleInfo({ root, editor, edit }: StyleInfoOptions): StyleInfo {
  const details = el('details', 'info');
  const summary = el('summary');
  const body = el('div', 'info-body');
  details.append(summary, body);
  root.append(details);

  let stylesheet: Stylesheet | undefined;
  let usage: UsageSummary | undefined;
  let version = 0;
  let drawn: string | undefined;
  let waiting: ReturnType<typeof setTimeout> | undefined;

  function card(title: string, rows: Rows, chain: readonly StyleName[], uses: HTMLElement) {
    const node = el('section', 'card');
    const button = el('button', undefined, 'Edit style');
    button.type = 'button';
    button.title = 'Open the style editor on the stylesheet of the project';
    button.addEventListener('click', edit);
    const head = el('p', 'card-title', title);
    head.append(button);
    const based = chain.length > 1 ? chain.slice(1).join(' \u2192 ') : 'nothing';
    node.append(head, el('p', 'based', `Based on: ${based}`), definition(rows), uses);
    return node;
  }

  function refresh(): void {
    clearTimeout(waiting);
    waiting = undefined;
    const current = editor();
    if (current === undefined || stylesheet === undefined) {
      root.hidden = true;
      drawn = undefined;
      return;
    }
    const sheet = stylesheet;
    const context = current.getContext();
    const paragraph = context.textStyle;
    const table = context.inTable ? (context.style ?? RESERVED_TABLE_STYLE) : undefined;
    const key = JSON.stringify([paragraph, table, version]);
    root.hidden = paragraph === undefined && table === undefined;
    if (key === drawn || root.hidden) return;
    drawn = key;
    const cards: HTMLElement[] = [];
    const names: string[] = [];
    if (paragraph !== undefined) {
      const label = context.labels.paragraph.get(paragraph);
      names.push(label ?? paragraph);
      cards.push(
        card(
          `Paragraph style ${label === undefined ? paragraph : `${label} (${paragraph})`}`,
          paragraphRows(sheet, paragraph),
          chainOf(sheet.paragraphStyles, paragraph),
          usageView(usage === undefined ? undefined : has(usage.paragraph, paragraph), usage),
        ),
      );
    }
    if (table !== undefined) {
      const label = context.labels.table.get(table);
      names.push(label ?? table);
      cards.push(
        card(
          `Table style ${label === undefined ? table : `${label} (${table})`}`,
          tableRows(sheet, table),
          chainOf(sheet.tableStyles, table),
          usageView(usage === undefined ? undefined : has(usage.table, table), usage),
        ),
      );
    }
    summary.textContent = `Style: ${names.join(' \u00b7 ')}`;
    body.replaceChildren(...cards);
  }

  return {
    setStylesheet(next) {
      stylesheet = next;
      version += 1;
    },
    setUsage(next) {
      usage = next;
      version += 1;
      refresh();
    },
    refresh,
    schedule() {
      waiting ??= setTimeout(refresh, DRAW_DELAY_MS);
    },
  };
}
