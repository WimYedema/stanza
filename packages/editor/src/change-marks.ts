import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as EditorNode } from '@tiptap/pm/model';

/**
 * Marks the blocks that changed from outside the editor (ADR 0062), as decorations: they are never
 * in the content. The marks are the start positions of top-level blocks, which follow the editing
 * of the person.
 */

export const CHANGED_CLASS = 'phrase-changed';

/** The most block pairs that are compared; a larger stretch of difference counts as all changed. */
const MAX_PAIRS = 4_000_000;

export interface BlockDiff {
  /** For each block of the new document, the block of the old one that is equal to it, or -1. */
  readonly kept: readonly number[];
  /** How many blocks of the old document are not in the new one. */
  readonly removed: number;
}

/** Compares the top-level blocks of two documents in order, by the longest run that they share. */
export function diffBlocks(before: EditorNode, after: EditorNode): BlockDiff {
  const old: EditorNode[] = [];
  const next: EditorNode[] = [];
  before.forEach((node) => old.push(node));
  after.forEach((node) => next.push(node));
  const kept = new Array<number>(next.length).fill(-1);

  let start = 0;
  while (start < old.length && start < next.length && old[start]?.eq(next[start] as EditorNode)) {
    kept[start] = start;
    start += 1;
  }
  let oldEnd = old.length;
  let nextEnd = next.length;
  while (
    oldEnd > start &&
    nextEnd > start &&
    old[oldEnd - 1]?.eq(next[nextEnd - 1] as EditorNode)
  ) {
    oldEnd -= 1;
    nextEnd -= 1;
    kept[nextEnd] = oldEnd;
  }

  const rows = oldEnd - start;
  const columns = nextEnd - start;
  if (rows > 0 && columns > 0 && rows * columns <= MAX_PAIRS) {
    // length[i][j]: the longest shared run of old[start + i ..] and next[start + j ..].
    const width = columns + 1;
    const length = new Uint32Array((rows + 1) * width);
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = columns - 1; j >= 0; j -= 1) {
        const same = old[start + i]?.eq(next[start + j] as EditorNode) === true;
        length[i * width + j] = same
          ? (length[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(length[(i + 1) * width + j] ?? 0, length[i * width + j + 1] ?? 0);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows && j < columns) {
      if (old[start + i]?.eq(next[start + j] as EditorNode) === true) {
        kept[start + j] = start + i;
        i += 1;
        j += 1;
      } else if ((length[(i + 1) * width + j] ?? 0) >= (length[i * width + j + 1] ?? 0)) i += 1;
      else j += 1;
    }
  }
  const matched = kept.filter((index) => index >= 0).length;
  return { kept, removed: old.length - matched };
}

/** The start position of each top-level block. */
export function blockStarts(doc: EditorNode): number[] {
  const starts: number[] = [];
  let pos = 0;
  doc.forEach((node) => {
    starts.push(pos);
    pos += node.nodeSize;
  });
  return starts;
}

interface State {
  readonly marks: readonly number[];
  readonly decorations: DecorationSet;
}

interface Meta {
  /** The start positions of the blocks to mark, instead of the marks there are. */
  readonly positions: readonly number[];
}

export const changeMarksKey = new PluginKey<State>('phrase-change-marks');

function build(doc: EditorNode, positions: readonly number[]): State {
  const marks = [...new Set(positions)]
    .filter((pos) => {
      if (pos < 0 || pos >= doc.content.size) return false;
      const at = doc.resolve(pos);
      return at.depth === 0 && at.nodeAfter !== null;
    })
    .sort((a, b) => a - b);
  const decorations = marks.flatMap((pos) => {
    const node = doc.resolve(pos).nodeAfter;
    return node === null
      ? []
      : [Decoration.node(pos, pos + node.nodeSize, { class: CHANGED_CLASS })];
  });
  return { marks, decorations: DecorationSet.create(doc, decorations) };
}

/** The numbers of the blocks that are marked, in order. */
export function markedBlocks(state: EditorState): number[] {
  const marks = changeMarksKey.getState(state)?.marks ?? [];
  return marks.map((pos) => state.doc.resolve(pos).index(0));
}

/** A transaction that marks the blocks with these start positions, and no others. */
export const markBlocks = (state: EditorState, positions: readonly number[]) =>
  state.tr.setMeta(changeMarksKey, { positions } satisfies Meta);

export const ChangeMarks = Extension.create({
  name: 'changeMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: changeMarksKey,
        state: {
          init: (_config, state) => build(state.doc, []),
          apply: (tr, previous, _old, state) => {
            const meta = tr.getMeta(changeMarksKey) as Meta | undefined;
            if (meta !== undefined) return build(state.doc, meta.positions);
            if (!tr.docChanged || previous.marks.length === 0) return previous;
            return build(
              state.doc,
              previous.marks.map((pos) => tr.mapping.map(pos, 1)),
            );
          },
        },
        props: { decorations: (state) => changeMarksKey.getState(state)?.decorations },
      }),
    ];
  },
});
