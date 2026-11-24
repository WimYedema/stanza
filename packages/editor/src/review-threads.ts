import { Extension } from '@tiptap/core';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Review comments in the editor (ADR 0086): where each thread of a review document is in the text
 * of the editor, and the highlight of its range. Nothing here is part of the document.
 */

/** What the editor needs of a thread to place it; the host reads it from the review document. */
export interface ThreadPlace {
  /** Unique among the threads shown, such as the review and the heading of the thread. */
  readonly key: string;
  /** The ID of the block the thread is on: the anchor. */
  readonly anchor?: string;
  readonly position?:
    | { readonly kind: 'under'; readonly paragraph: number }
    | { readonly kind: 'after'; readonly paragraph: number }
    | { readonly kind: 'cell'; readonly row: number; readonly column: number };
  readonly quote?: { readonly start: string; readonly end?: string };
  /** Shown as the tooltip of the highlight, such as the author and the first comment. */
  readonly label?: string;
}

export type Placement =
  /** The quote was found: the range of characters it covers. */
  | { readonly kind: 'range'; readonly from: number; readonly to: number }
  /** At the block: there is no quote, or it is not in the text any more (`changed`). */
  | { readonly kind: 'block'; readonly pos: number; readonly changed: boolean }
  /** The document has no block with the ID of the anchor, or the thread has none. */
  | { readonly kind: 'orphan' };

/** The textblocks of the document in order, with the position where each one starts. */
function textblocks(doc: EditorNode): { node: EditorNode; pos: number }[] {
  const found: { node: EditorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

/** The position of the block with an ID, at any depth. */
function blockWithId(doc: EditorNode, id: string): { node: EditorNode; pos: number } | undefined {
  let found: { node: EditorNode; pos: number } | undefined;
  doc.descendants((node, pos) => {
    if (found !== undefined) return false;
    if (node.attrs['id'] === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

/** Where the block of a thread's anchor starts now, if the document has it. */
export function anchorPosition(doc: EditorNode, anchor: string | undefined): number | undefined {
  return anchor === undefined ? undefined : blockWithId(doc, anchor)?.pos;
}

/**
 * The text of some textblocks with the document position of each character, whitespace collapsed
 * to one space, so that a quote, which the review document wrote on one line, can be looked for.
 */
interface Indexed {
  readonly text: string;
  /** The position of each character of `text`; a space between blocks has the next one's. */
  readonly at: readonly number[];
  /** The textblock that each character is in, by its index among the textblocks. */
  readonly block: readonly number[];
}

function indexText(blocks: readonly { node: EditorNode; pos: number }[], first: number): Indexed {
  let text = '';
  const at: number[] = [];
  const block: number[] = [];
  const push = (char: string, pos: number, index: number): void => {
    const space = /\s/.test(char);
    if (space && (text === '' || text.endsWith(' '))) return;
    text += space ? ' ' : char;
    at.push(pos);
    block.push(index);
  };
  blocks.forEach(({ node, pos }, offset) => {
    const index = first + offset;
    if (offset > 0) push(' ', pos + 1, index);
    node.forEach((child, childOffset) => {
      const start = pos + 1 + childOffset;
      if (child.isText) {
        const value = child.text ?? '';
        for (let i = 0; i < value.length; i++) push(value[i] ?? '', start + i, index);
      } else {
        push(' ', start, index);
      }
    });
  });
  return { text, at, block };
}

const normal = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Every index at which `needle` occurs in `text`. */
function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];
  if (needle === '') return found;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}

/** The index among the textblocks that the position hint names, counted as in the DOCX. */
function hintedBlock(
  blocks: readonly { node: EditorNode; pos: number }[],
  anchor: { node: EditorNode; pos: number },
  position: NonNullable<ThreadPlace['position']>,
): number | undefined {
  const firstIn = blocks.findIndex((b) => b.pos >= anchor.pos);
  if (firstIn < 0) return undefined;
  if (position.kind === 'under') return firstIn + position.paragraph;
  const end = anchor.pos + anchor.node.nodeSize;
  if (position.kind === 'after') {
    const afterTable = blocks.findIndex((b) => b.pos >= end);
    return afterTable < 0 ? undefined : afterTable + position.paragraph - 1;
  }
  // A cell: the first textblock of the cell at the row and column.
  const row = anchor.node.maybeChild(position.row - 1);
  if (row === null || row.maybeChild(position.column - 1) === null) return undefined;
  let pos = anchor.pos + 1;
  for (let r = 0; r < position.row - 1; r++) pos += anchor.node.child(r).nodeSize;
  pos += 1;
  for (let c = 0; c < position.column - 1; c++) pos += row.child(c).nodeSize;
  const index = blocks.findIndex((b) => b.pos > pos);
  return index < 0 ? undefined : index;
}

/**
 * Where a thread is in the text (ADR 0086): the block of its anchor, the quote in the section of
 * that block, and the position only to choose between occurrences of the same quote. A quote that
 * is not found leaves the thread at its block, marked as changed.
 */
export function placeThread(doc: EditorNode, thread: ThreadPlace): Placement {
  if (thread.anchor === undefined) return { kind: 'orphan' };
  const anchor = blockWithId(doc, thread.anchor);
  if (anchor === undefined) return { kind: 'orphan' };
  const atBlock = (changed: boolean): Placement => ({ kind: 'block', pos: anchor.pos, changed });
  const start = thread.quote === undefined ? '' : normal(thread.quote.start);
  if (start === '') return atBlock(false);

  const blocks = textblocks(doc);
  // The section of the anchor: from its top-level block to the next heading at the top level.
  const $anchor = doc.resolve(anchor.pos);
  const top = $anchor.index(0);
  let sectionEnd = doc.content.size;
  for (let i = top + 1, pos = $anchor.posAtIndex(top + 1, 0); i < doc.childCount; i++) {
    const node = doc.child(i);
    if (node.type.name === 'heading') {
      sectionEnd = pos;
      break;
    }
    pos += node.nodeSize;
  }
  const sectionStart = $anchor.posAtIndex(top, 0);
  // A range that starts in text without an ID is on the first block with an ID inside it (ADR
  // 0084), so the quote can start in the blocks without an ID just before the anchor.
  let lead = top;
  while (lead > 0 && doc.child(lead - 1).attrs['id'] == null) lead--;
  const leadStart = $anchor.posAtIndex(lead, 0);
  const first = blocks.findIndex((b) => b.pos >= leadStart);
  if (first < 0) return atBlock(true);
  const inSection = blocks.slice(first).filter((b) => b.pos < sectionEnd);
  // A long quote can run on past the section; its end is looked for in the rest of the text.
  const indexed = indexText(blocks.slice(first), first);
  const sectionLength = indexed.block.findIndex((b) => b >= first + inSection.length);
  const limit = sectionLength < 0 ? indexed.text.length : sectionLength;
  const leadLength = indexed.at.findIndex((pos) => pos >= sectionStart);

  // In the section of the anchor if the quote is there, else in the text before it.
  const all = occurrences(indexed.text, start).filter((at) => at < limit);
  const inOwn = all.filter((at) => leadLength < 0 || at >= leadLength);
  const candidates = inOwn.length > 0 ? inOwn : all.slice(-1);
  if (candidates.length === 0) return atBlock(true);
  const hint =
    thread.position === undefined ? undefined : hintedBlock(blocks, anchor, thread.position);
  const chosen =
    (hint === undefined ? undefined : candidates.find((at) => indexed.block[at] === hint)) ??
    candidates[0] ??
    0;

  let endIndex = chosen + start.length;
  const end = thread.quote?.end === undefined ? '' : normal(thread.quote.end);
  if (end !== '') {
    const found = indexed.text.indexOf(end, endIndex);
    if (found < 0) return atBlock(true);
    endIndex = found + end.length;
  }
  const from = indexed.at[chosen] ?? anchor.pos;
  const to = (indexed.at[endIndex - 1] ?? from) + 1;
  return { kind: 'range', from, to };
}

export const REVIEW_HIGHLIGHT_CLASS = 'stanza-review-highlight';
export const REVIEW_HIGHLIGHT_SELECTED_CLASS = 'stanza-review-highlight-selected';

interface HighlightState {
  readonly ranges: readonly {
    readonly key: string;
    readonly from: number;
    readonly to: number;
    readonly label?: string;
  }[];
  readonly selected?: string;
  readonly decorations: DecorationSet;
}

interface HighlightMeta {
  readonly ranges?: HighlightState['ranges'];
  /** The key of the selected thread; null for none. */
  readonly selected?: string | null;
}

export const reviewHighlightsKey = new PluginKey<HighlightState>('stanza-review-highlights');

function decorate(
  doc: EditorNode,
  ranges: HighlightState['ranges'],
  selected: string | undefined,
): HighlightState {
  const valid = ranges.filter((r) => r.from < r.to && r.from >= 0 && r.to <= doc.content.size);
  const decorations = valid.map((r) =>
    Decoration.inline(
      r.from,
      r.to,
      {
        class:
          r.key === selected
            ? `${REVIEW_HIGHLIGHT_CLASS} ${REVIEW_HIGHLIGHT_SELECTED_CLASS}`
            : REVIEW_HIGHLIGHT_CLASS,
        'data-thread': r.key,
        ...(r.label !== undefined ? { title: r.label } : {}),
      },
      { key: r.key },
    ),
  );
  return {
    ranges: valid,
    ...(selected !== undefined ? { selected } : {}),
    decorations: DecorationSet.create(doc, decorations),
  };
}

/** A transaction that highlights these ranges, in place of the ones before. */
export const highlightThreads = (state: EditorState, ranges: HighlightState['ranges']) =>
  state.tr.setMeta(reviewHighlightsKey, { ranges } satisfies HighlightMeta);

/** A transaction that marks one thread as selected, or none. */
export const selectThread = (state: EditorState, key: string | undefined) =>
  state.tr.setMeta(reviewHighlightsKey, { selected: key ?? null } satisfies HighlightMeta);

/** The highlighted ranges as they are now, after the edits since they were placed. */
export function highlightedThreads(state: EditorState): HighlightState['ranges'] {
  return reviewHighlightsKey.getState(state)?.ranges ?? [];
}

/**
 * The highlights of the threads. They move with the text while editing, and are dropped when the
 * text they covered is deleted.
 */
export const ReviewHighlights = Extension.create({
  name: 'reviewHighlights',
  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: reviewHighlightsKey,
        state: {
          init: (_config, state) => decorate(state.doc, [], undefined),
          apply: (tr, previous, _old, state) => {
            const meta = tr.getMeta(reviewHighlightsKey) as HighlightMeta | undefined;
            const selected =
              meta?.selected === null ? undefined : (meta?.selected ?? previous.selected);
            if (meta?.ranges !== undefined) return decorate(state.doc, meta.ranges, selected);
            if (!tr.docChanged && meta === undefined) return previous;
            const ranges = previous.ranges.map((r) => ({
              ...r,
              from: tr.mapping.map(r.from, 1),
              to: tr.mapping.map(r.to, -1),
            }));
            return decorate(state.doc, ranges, selected);
          },
        },
        props: { decorations: (state) => reviewHighlightsKey.getState(state)?.decorations },
      }),
    ];
  },
});
