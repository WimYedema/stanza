import type { Node as EditorNode, MarkType, ResolvedPos } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

export interface Located {
  readonly node: EditorNode;
  readonly pos: number;
}

const CELLS: readonly string[] = ['tableCell', 'tableHeader'];

/**
 * Where a block is in a table: `cell` when its parent is a cell, so that it takes the cell style of
 * the table, and `inside` deeper in a cell, as in a list of the cell. Undefined outside tables.
 */
export function cellPlace($pos: ResolvedPos): 'cell' | 'inside' | undefined {
  if (CELLS.includes($pos.parent.type.name)) return 'cell';
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (CELLS.includes($pos.node(depth).type.name)) return 'inside';
  }
  return undefined;
}

/** The depth of the innermost table around a position, or -1 outside tables. */
export function tableDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'table') return depth;
  }
  return -1;
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
