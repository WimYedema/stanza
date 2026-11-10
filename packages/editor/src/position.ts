import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node } from '@tiptap/pm/model';

/**
 * Where the cursor is, in a way that survives replacing the content: the number of the top-level
 * block, and how many characters of text come before the cursor in it. A host uses this to put the
 * cursor back after the document changed outside the editor.
 */
export interface EditorPosition {
  readonly block: number;
  readonly offset: number;
}

export function editorPosition(state: EditorState): EditorPosition {
  const { $head } = state.selection;
  if ($head.depth === 0) return { block: $head.index(), offset: 0 };
  const offset = state.doc.textBetween($head.start(1), $head.pos, '\n', '\n').length;
  return { block: $head.index(0), offset };
}

/**
 * Where the last change between two documents ends, in the second one: after the text that was
 * inserted, or at the place where text was taken out. That is where the cursor goes after an undo,
 * a redo or any other change from outside. Undefined when the documents are the same.
 */
export function changeEnd(before: Node, after: Node): number | undefined {
  const start = before.content.findDiffStart(after.content);
  if (start === null) return undefined;
  const end = before.content.findDiffEnd(after.content);
  if (end === null) return undefined;
  // The common start and the common end may overlap, as in "aa" becoming "aaa".
  const overlap = start - Math.min(end.a, end.b);
  return overlap > 0 ? end.b + overlap : end.b;
}

/** A transaction that puts the cursor at a place in the document, or at the nearest text before it. */
export function moveToPosition(state: EditorState, pos: number): Transaction {
  const { doc } = state;
  const at = Math.max(0, Math.min(pos, doc.content.size));
  return state.tr.setSelection(Selection.near(doc.resolve(at), -1)).scrollIntoView();
}

/** A transaction that puts the cursor at a position, or as near to it as the document allows. */
export function moveTo(state: EditorState, position: EditorPosition): Transaction {
  const { doc } = state;
  if (doc.childCount === 0) return state.tr;
  const index = Math.max(0, Math.min(position.block, doc.childCount - 1));
  let start = 0;
  for (let child = 0; child < index; child += 1) start += doc.child(child).nodeSize;
  const node = doc.child(index);
  const from = start + 1;
  const to = start + node.nodeSize - 1;
  let target = Math.min(from, to);
  for (let pos = from; pos <= to; pos += 1) {
    target = pos;
    if (doc.textBetween(from, pos, '\n', '\n').length >= position.offset) break;
  }
  const near = node.isLeaf ? start : target;
  return state.tr.setSelection(Selection.near(doc.resolve(near), 1)).scrollIntoView();
}
