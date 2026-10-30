import type { Node as EditorNode, MarkType } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

export interface Located {
  readonly node: EditorNode;
  readonly pos: number;
}

/** The blocks of text that the selection touches. */
export function selectedBlocks(state: EditorState): readonly Located[] {
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

/** Whether the text at the selection has the mark, or typing at the cursor would have it. */
export function markActive(state: EditorState, type: MarkType): boolean {
  const { selection } = state;
  return selection.empty
    ? type.isInSet(state.storedMarks ?? selection.$from.marks()) !== undefined
    : selection.ranges.some((range) =>
        state.doc.rangeHasMark(range.$from.pos, range.$to.pos, type),
      );
}
