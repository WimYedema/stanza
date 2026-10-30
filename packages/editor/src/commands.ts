import {
  VARIANT_MARKS,
  isStyleName,
  markAllowed,
  type HeadingLevel,
  type StyleName,
  type Stylesheet,
  type VariantMark,
} from '@phrase/core';
import { getMarkRange } from '@tiptap/core';
import { toggleMark } from '@tiptap/pm/commands';
import type { Node as EditorNode, NodeType } from '@tiptap/pm/model';
import { liftListItem, sinkListItem, wrapInList } from '@tiptap/pm/schema-list';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from '@tiptap/pm/tables';
import { introducedViolations, textStyle } from './block-styles.js';

/**
 * The semantic commands of the editor (ADR 0023). A command is data, and says what to do and not how
 * it looks: the look comes from styles. Each one is planned against the current state, checked
 * against the rules of the stylesheet, and only then applied, so a refused command changes nothing.
 */

export type EditorCommand =
  | { readonly type: 'toggle-mark'; readonly mark: 'strong' | 'emphasis' | 'code' }
  | { readonly type: 'set-link'; readonly href: string }
  | { readonly type: 'remove-link' }
  | { readonly type: 'toggle-character-style'; readonly style: StyleName }
  | { readonly type: 'set-heading'; readonly level: HeadingLevel }
  | { readonly type: 'set-paragraph' }
  | { readonly type: 'set-style'; readonly style: StyleName | null }
  | { readonly type: 'toggle-list'; readonly kind: 'bulleted' | 'numbered' }
  | { readonly type: 'sink-list-item' }
  | { readonly type: 'lift-list-item' }
  | { readonly type: 'toggle-code-block'; readonly language?: string }
  | { readonly type: 'insert-phrase-block'; readonly kind: string; readonly text: string }
  | { readonly type: 'insert-table'; readonly columns: number; readonly rows: number }
  | { readonly type: 'add-row'; readonly where: 'before' | 'after' }
  | { readonly type: 'add-column'; readonly where: 'before' | 'after' }
  | { readonly type: 'delete-row' }
  | { readonly type: 'delete-column' }
  | { readonly type: 'delete-table' };

export type RefusalReason =
  /** A mark that the style of the text does not allow. */
  | 'mark-not-allowed'
  /** A change of style or kind that would leave marks the new style does not allow. */
  | 'marks-not-allowed'
  | 'unknown-style'
  | 'header-row'
  | 'invalid-argument'
  /** Nothing to apply the command to at the selection. */
  | 'not-applicable';

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RefusalReason; readonly message: string };

type Refusal = Extract<CommandResult, { ok: false }>;
type Plan = { readonly transactions: readonly Transaction[] } | Refusal;

const refuse = (reason: RefusalReason, message: string): Refusal => ({
  ok: false,
  reason,
  message,
});
const done = (...transactions: Transaction[]): Plan => ({ transactions });
const isRefusal = (plan: Plan): plan is Refusal => 'ok' in plan;

/** The schemes that a link may have: web pages, mail, and a block of the same project. */
export function isAllowedHref(href: string): boolean {
  const text = href.trim();
  const hasControl = Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (text === '' || hasControl || /\s/.test(text)) return false;
  if (text.startsWith('#')) return text.length > 1;
  return /^(https?|mailto):\S+/i.test(text);
}

interface Located {
  readonly node: EditorNode;
  readonly pos: number;
}

/** The ID of a block, which a change of kind keeps. */
const idOf = (node: EditorNode): unknown => node.attrs['id'];

/** The blocks of text that the selection touches. */
function selectedBlocks(state: EditorState): readonly Located[] {
  const seen = new Set<number>();
  const found: Located[] = [];
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      if (!seen.has(pos)) {
        seen.add(pos);
        found.push({ node, pos });
      }
      return false;
    });
  }
  return found;
}

/** Runs a command of ProseMirror against a state and returns what it would do. */
function fromCommand(
  state: EditorState,
  command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean,
  failure: string,
): Plan {
  const captured: Transaction[] = [];
  const ok = command(state, (tr) => captured.push(tr));
  return ok ? { transactions: captured } : refuse('not-applicable', failure);
}

function listDepth(state: EditorState): number {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === 'bulletList' || name === 'orderedList') return depth;
  }
  return -1;
}

const NO_BLOCK = 'Put the cursor in a block of text.';

function planToggleMark(
  state: EditorState,
  mark: 'strong' | 'emphasis' | 'code',
  stylesheet: Stylesheet,
): Plan {
  const type = state.schema.marks[mark];
  const blocks = selectedBlocks(state);
  const first = blocks[0];
  if (type === undefined || first === undefined) return refuse('not-applicable', NO_BLOCK);
  const { selection } = state;
  const has = selection.empty
    ? type.isInSet(state.storedMarks ?? selection.$from.marks()) !== undefined
    : selection.ranges.some((range) =>
        state.doc.rangeHasMark(range.$from.pos, range.$to.pos, type),
      );
  if (!has) {
    if (blocks.some(({ node }) => node.type.name === 'codeBlock')) {
      return refuse('mark-not-allowed', 'Code blocks take no marks.');
    }
    // At a cursor the mark is only remembered for typing, so no change shows the problem later.
    const style = textStyle(state.doc, first.pos, first.node, stylesheet);
    if (selection.empty && style !== undefined && !markAllowed(stylesheet, style, mark)) {
      return refuse('mark-not-allowed', `The style "${style}" does not allow ${mark}.`);
    }
  }
  return fromCommand(state, toggleMark(type), NO_BLOCK);
}

function planLink(state: EditorState, href: string): Plan {
  const type = state.schema.marks['link'];
  if (type === undefined) return refuse('not-applicable', NO_BLOCK);
  if (!isAllowedHref(href)) {
    return refuse(
      'invalid-argument',
      'A link goes to a web page (http or https), a mail address, or a block (#).',
    );
  }
  if (state.selection.empty) return refuse('not-applicable', 'Select the text to link.');
  if (selectedBlocks(state).some(({ node }) => node.type.name === 'codeBlock')) {
    return refuse('mark-not-allowed', 'Code blocks take no marks.');
  }
  const tr = state.tr;
  for (const range of state.selection.ranges) {
    tr.addMark(range.$from.pos, range.$to.pos, type.create({ href: href.trim() }));
  }
  return done(tr);
}

function planRemoveLink(state: EditorState): Plan {
  const type = state.schema.marks['link'];
  if (type === undefined) return refuse('not-applicable', NO_BLOCK);
  const tr = state.tr;
  if (state.selection.empty) {
    const range = getMarkRange(state.selection.$from, type);
    if (range === undefined) return refuse('not-applicable', 'Put the cursor in a link.');
    tr.removeMark(range.from, range.to, type);
  } else {
    for (const range of state.selection.ranges) {
      tr.removeMark(range.$from.pos, range.$to.pos, type);
    }
  }
  return tr.docChanged ? done(tr) : refuse('not-applicable', 'There is no link in the selection.');
}

function planCharacterStyle(state: EditorState, name: StyleName, stylesheet: Stylesheet): Plan {
  const type = state.schema.marks['style'];
  if (type === undefined) return refuse('not-applicable', NO_BLOCK);
  if (!stylesheet.characterStyles.has(name)) {
    return refuse('unknown-style', `"${name}" is not a character style of the stylesheet.`);
  }
  const mark = type.create({ name });
  const { selection } = state;
  const has = selection.empty
    ? mark.isInSet(state.storedMarks ?? selection.$from.marks())
    : selection.ranges.some((range) => {
        let found = false;
        state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
          if (node.isText && mark.isInSet(node.marks)) found = true;
        });
        return found;
      });
  const tr = state.tr;
  if (!has && selectedBlocks(state).some(({ node }) => node.type.name === 'codeBlock')) {
    return refuse('mark-not-allowed', 'Code blocks take no marks.');
  }
  if (selection.empty) {
    if (has) tr.removeStoredMark(mark);
    else tr.addStoredMark(mark);
    return done(tr);
  }
  for (const range of selection.ranges) {
    if (has) tr.removeMark(range.$from.pos, range.$to.pos, mark);
    else tr.addMark(range.$from.pos, range.$to.pos, mark);
  }
  return done(tr);
}

/** The blocks to change kind: paragraphs and headings, where the parent accepts the new kind. */
function retypeable(
  state: EditorState,
  kinds: readonly string[],
  to: string,
): { readonly blocks: readonly Located[]; readonly type: NodeType } | Refusal {
  const blocks = selectedBlocks(state);
  const type = state.schema.nodes[to];
  if (type === undefined || blocks.length === 0) return refuse('not-applicable', NO_BLOCK);
  for (const { node, pos } of blocks) {
    const $pos = state.doc.resolve(pos);
    if (
      !kinds.includes(node.type.name) ||
      !$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, type)
    ) {
      return refuse('not-applicable', `This cannot be a ${to} here.`);
    }
  }
  return { blocks, type };
}

function planHeading(state: EditorState, level: HeadingLevel): Plan {
  const found = retypeable(state, ['paragraph', 'heading'], 'heading');
  if ('ok' in found) return found;
  const tr = state.tr;
  for (const { node, pos } of found.blocks) {
    // Style names belong to a kind of block, so the new block has the default style.
    tr.setNodeMarkup(pos, found.type, { id: idOf(node), level, style: null });
  }
  return done(tr);
}

function planParagraph(state: EditorState): Plan {
  const found = retypeable(state, ['paragraph', 'heading'], 'paragraph');
  if ('ok' in found) return found;
  const tr = state.tr;
  for (const { node, pos } of found.blocks) {
    if (node.type.name === 'heading') {
      tr.setNodeMarkup(pos, found.type, { id: idOf(node), style: null });
    }
  }
  return done(tr);
}

function planStyle(state: EditorState, style: StyleName | null, stylesheet: Stylesheet): Plan {
  const blocks = selectedBlocks(state);
  if (blocks.length === 0) return refuse('not-applicable', NO_BLOCK);
  const cells = blocks.filter(({ node }) => ['tableCell', 'tableHeader'].includes(node.type.name));
  const tr = state.tr;
  if (cells.length > 0) {
    if (cells.length !== blocks.length) {
      return refuse('not-applicable', 'Select text blocks or table cells, not both.');
    }
    if (style !== null && !stylesheet.tableStyles.has(style)) {
      return refuse('unknown-style', `"${style}" is not a table style of the stylesheet.`);
    }
    const tables = new Set(
      cells.map(({ pos }) => {
        const $pos = state.doc.resolve(pos);
        return $pos.before($pos.depth - 1);
      }),
    );
    for (const pos of tables) tr.setNodeAttribute(pos, 'style', style);
    return done(tr);
  }
  if (style !== null && !stylesheet.paragraphStyles.has(style)) {
    return refuse('unknown-style', `"${style}" is not a paragraph style of the stylesheet.`);
  }
  for (const { pos } of blocks) tr.setNodeAttribute(pos, 'style', style);
  return done(tr);
}

function planList(state: EditorState, kind: 'bulleted' | 'numbered'): Plan {
  const listType = state.schema.nodes[kind === 'bulleted' ? 'bulletList' : 'orderedList'];
  const itemType = state.schema.nodes['listItem'];
  if (listType === undefined || itemType === undefined) {
    return refuse('not-applicable', NO_BLOCK);
  }
  const depth = listDepth(state);
  if (depth < 0) return fromCommand(state, wrapInList(listType), 'A list cannot be made here.');
  const list = state.selection.$from.node(depth);
  if (list.type !== listType) {
    return done(state.tr.setNodeMarkup(state.selection.$from.before(depth), listType, list.attrs));
  }
  // The same kind again takes the item out of its list, through every level.
  const transactions: Transaction[] = [];
  let current = state;
  for (let step = 0; step < 32 && listDepth(current) >= 0; step += 1) {
    const captured: Transaction[] = [];
    if (!liftListItem(itemType)(current, (tr) => captured.push(tr))) break;
    const [tr] = captured;
    if (tr === undefined) break;
    transactions.push(tr);
    current = current.apply(tr);
  }
  return transactions.length > 0 ? { transactions } : refuse('not-applicable', NO_BLOCK);
}

function planCodeBlock(state: EditorState, language: string | undefined): Plan {
  const blocks = selectedBlocks(state);
  const code = state.schema.nodes['codeBlock'];
  const paragraph = state.schema.nodes['paragraph'];
  if (code === undefined || paragraph === undefined || blocks.length === 0) {
    return refuse('not-applicable', NO_BLOCK);
  }
  const tr = state.tr;
  if (blocks.every(({ node }) => node.type === code)) {
    for (const { node, pos } of blocks)
      tr.setNodeMarkup(pos, paragraph, { id: idOf(node), style: null });
    return done(tr);
  }
  for (const { node, pos } of blocks) {
    if (node.type === code) continue;
    const $pos = state.doc.resolve(pos);
    if (
      node.type !== paragraph ||
      !$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, code)
    ) {
      return refuse('not-applicable', 'Only a paragraph can become a code block.');
    }
    const marked = Array.from({ length: node.childCount }, (_, index) => node.child(index)).some(
      (child) => child.marks.length > 0,
    );
    if (marked) {
      return refuse(
        'marks-not-allowed',
        'Remove the marks of the text first: a code block takes none.',
      );
    }
    tr.setNodeMarkup(pos, code, { id: idOf(node), style: null, language: language ?? null });
  }
  return done(tr);
}

/** Puts a new block after the top-level block of the selection, or in place of an empty paragraph. */
function insertBlock(state: EditorState, block: EditorNode): Plan {
  const { $from } = state.selection;
  if ($from.depth === 0) return refuse('not-applicable', NO_BLOCK);
  const top = $from.node(1);
  const start = $from.before(1);
  const empty = top.type.name === 'paragraph' && top.content.size === 0 && top.attrs['id'] === null;
  const tr = state.tr;
  if (empty) tr.replaceWith(start, start + top.nodeSize, block);
  else tr.insert(start + top.nodeSize, block);
  tr.setSelection(TextSelection.near(tr.doc.resolve(empty ? start : start + top.nodeSize), 1));
  return done(tr);
}

const KIND = /^[a-z][a-z0-9-]*$/;

function planPhraseBlock(state: EditorState, kind: string, text: string): Plan {
  const type = state.schema.nodes['phraseBlock'];
  if (type === undefined) return refuse('not-applicable', NO_BLOCK);
  if (!KIND.test(kind)) {
    return refuse(
      'invalid-argument',
      'The kind of a phrase block is lowercase letters, digits and hyphens.',
    );
  }
  return insertBlock(state, type.create({ kind, text }));
}

const MAX_COLUMNS = 20;
const MAX_ROWS = 200;

function planInsertTable(state: EditorState, columns: number, rows: number): Plan {
  const { table, tableRow, tableHeader, tableCell } = state.schema.nodes;
  if (
    table === undefined ||
    tableRow === undefined ||
    tableHeader === undefined ||
    tableCell === undefined
  ) {
    return refuse('not-applicable', NO_BLOCK);
  }
  if (!Number.isInteger(columns) || columns < 1 || columns > MAX_COLUMNS) {
    return refuse('invalid-argument', `A table has from 1 to ${String(MAX_COLUMNS)} columns.`);
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) {
    return refuse(
      'invalid-argument',
      `A table has from 1 to ${String(MAX_ROWS)} rows besides the header.`,
    );
  }
  const row = (cell: typeof tableCell): EditorNode =>
    tableRow.create(
      null,
      Array.from({ length: columns }, () => cell.create()),
    );
  const body = Array.from({ length: rows }, () => row(tableCell));
  return insertBlock(state, table.create(null, [row(tableHeader), ...body]));
}

const firstRowIsHeader = (table: EditorNode): boolean =>
  table.firstChild?.firstChild?.type.name === 'tableHeader';

const NOT_IN_TABLE = 'Put the cursor in a table.';

function planTable(state: EditorState, command: EditorCommand): Plan {
  if (!isInTable(state)) return refuse('not-applicable', NOT_IN_TABLE);
  const rect = selectedRect(state);
  const onHeader = rect.top === 0 && firstRowIsHeader(rect.table);
  const fail = 'This cannot be done here.';
  switch (command.type) {
    case 'add-row':
      if (command.where === 'before' && onHeader) {
        return refuse('header-row', 'A row cannot be added above the header row.');
      }
      return fromCommand(state, command.where === 'before' ? addRowBefore : addRowAfter, fail);
    case 'add-column':
      return fromCommand(
        state,
        command.where === 'before' ? addColumnBefore : addColumnAfter,
        fail,
      );
    case 'delete-row':
      if (onHeader) return refuse('header-row', 'The header row of a table cannot be deleted.');
      return fromCommand(state, deleteRow, 'The last row cannot be deleted. Delete the table.');
    case 'delete-column':
      return fromCommand(
        state,
        deleteColumn,
        'The last column cannot be deleted. Delete the table.',
      );
    default:
      return fromCommand(state, deleteTable, fail);
  }
}

function plan(state: EditorState, command: EditorCommand, stylesheet: Stylesheet): Plan {
  switch (command.type) {
    case 'toggle-mark':
      return planToggleMark(state, command.mark, stylesheet);
    case 'set-link':
      return planLink(state, command.href);
    case 'remove-link':
      return planRemoveLink(state);
    case 'toggle-character-style':
      return planCharacterStyle(state, command.style, stylesheet);
    case 'set-heading':
      return planHeading(state, command.level);
    case 'set-paragraph':
      return planParagraph(state);
    case 'set-style':
      return command.style !== null && !isStyleName(command.style)
        ? refuse('invalid-argument', `"${String(command.style)}" is not a style name.`)
        : planStyle(state, command.style, stylesheet);
    case 'toggle-list':
      return planList(state, command.kind);
    case 'sink-list-item': {
      const item = state.schema.nodes['listItem'];
      return item === undefined
        ? refuse('not-applicable', NO_BLOCK)
        : fromCommand(
            state,
            sinkListItem(item),
            'Put the cursor in a list item that has one before it.',
          );
    }
    case 'lift-list-item': {
      const item = state.schema.nodes['listItem'];
      return item === undefined
        ? refuse('not-applicable', NO_BLOCK)
        : fromCommand(state, liftListItem(item), 'Put the cursor in a list item.');
    }
    case 'toggle-code-block':
      return planCodeBlock(state, command.language);
    case 'insert-phrase-block':
      return planPhraseBlock(state, command.kind, command.text);
    case 'insert-table':
      return planInsertTable(state, command.columns, command.rows);
    default:
      return planTable(state, command);
  }
}

const MARK_COMMANDS: ReadonlySet<EditorCommand['type']> = new Set([
  'toggle-mark',
  'set-link',
  'toggle-character-style',
]);

/**
 * Runs a command. It is refused, and changes nothing, when it would give a block a mark that its
 * style does not allow: a mark that the style does not offer (ADR 0006) is never added, and a
 * change of style or kind is not allowed to leave one behind. Marks that are already wrong are
 * left for validation, and removing a mark is always possible.
 */
export function runCommand(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  command: EditorCommand,
  stylesheet: Stylesheet,
): CommandResult {
  const planned = plan(state, command, stylesheet);
  if (isRefusal(planned)) return planned;
  let result = state;
  for (const tr of planned.transactions) result = result.apply(tr);
  const introduced = introducedViolations(state.doc, result.doc, stylesheet);
  if (introduced.length > 0) {
    const marks = (style: StyleName): string =>
      VARIANT_MARKS.filter((mark: VariantMark) =>
        introduced.some((violation) => violation.style === style && violation.mark === mark),
      ).join(', ');
    const [first] = introduced;
    const style = first?.style;
    if (style === undefined) return refuse('not-applicable', 'The command cannot be done.');
    return MARK_COMMANDS.has(command.type)
      ? refuse('mark-not-allowed', `The style "${style}" does not allow ${marks(style)}.`)
      : refuse(
          'marks-not-allowed',
          `The text has marks that the style "${style}" does not allow: ${marks(style)}. Remove them first.`,
        );
  }
  for (const tr of planned.transactions) dispatch(tr);
  return { ok: true };
}
