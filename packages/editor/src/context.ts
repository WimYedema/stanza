import {
  VARIANT_MARKS,
  isStyleName,
  markAllowed,
  type StyleName,
  type Stylesheet,
  type VariantMark,
} from '@phrase/core';
import type { Mark } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { styleOf, textStyle } from './block-styles.js';
import { markActive, selectedBlocks } from './selection.js';

export interface MarkState {
  /** The text at the selection has the mark, or typing at the cursor will have it. */
  readonly active: boolean;
  /** Every block of the selection has a style that allows the mark (ADR 0006). */
  readonly allowed: boolean;
}

/**
 * The state at the selection, for the parts of an interface that show it: what kind of block it is,
 * which style it has, which marks are on and which are allowed (ADR 0026). It is plain data.
 */
export interface EditorContext {
  /** The first block of text of the selection, or undefined where there is none. */
  readonly block: 'paragraph' | 'heading' | 'code-block' | 'table-cell' | undefined;
  /**
   * The style that the block names itself, or undefined for the default one. For a table cell it
   * is the style of the table.
   */
  readonly style: StyleName | undefined;
  /** The paragraph style that decides which marks the block takes, or undefined if it takes none. */
  readonly textStyle: StyleName | undefined;
  readonly marks: Readonly<Record<VariantMark, MarkState>>;
  /** The character styles at the selection. */
  readonly characterStyles: readonly StyleName[];
  /** What the stylesheet declares, to choose from: table styles for a cell, else paragraph styles. */
  readonly available: {
    readonly paragraph: readonly StyleName[];
    readonly character: readonly StyleName[];
    readonly table: readonly StyleName[];
  };
}

function activeCharacterStyles(state: EditorState): readonly StyleName[] {
  const names = new Set<StyleName>();
  const add = (marks: readonly Mark[]): void => {
    for (const mark of marks) {
      const name: unknown = mark.attrs['name'];
      if (mark.type.name === 'style' && typeof name === 'string' && isStyleName(name)) {
        names.add(name);
      }
    }
  };
  const { selection } = state;
  if (selection.empty) add(state.storedMarks ?? selection.$from.marks());
  else {
    for (const range of selection.ranges) {
      state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
        if (node.isText) add(node.marks);
      });
    }
  }
  return [...names];
}

export function editorContext(state: EditorState, stylesheet: Stylesheet): EditorContext {
  const blocks = selectedBlocks(state);
  const first = blocks[0];
  const kind = first?.node.type.name;
  const block =
    kind === undefined
      ? undefined
      : kind === 'heading'
        ? 'heading'
        : kind === 'codeBlock'
          ? 'code-block'
          : kind === 'tableCell' || kind === 'tableHeader'
            ? 'table-cell'
            : 'paragraph';
  let style: StyleName | undefined;
  if (first !== undefined) {
    const $pos = state.doc.resolve(first.pos);
    style = styleOf(block === 'table-cell' ? $pos.node($pos.depth - 1) : first.node);
  }
  const marks = Object.fromEntries(
    VARIANT_MARKS.map((mark) => {
      const type = state.schema.marks[mark];
      return [
        mark,
        {
          active: type !== undefined && markActive(state, type),
          allowed:
            blocks.length > 0 &&
            blocks.every(({ node, pos }) => {
              const own = textStyle(state.doc, pos, node, stylesheet);
              return own !== undefined && markAllowed(stylesheet, own, mark);
            }),
        },
      ];
    }),
  ) as Record<VariantMark, MarkState>;
  return {
    block,
    style,
    textStyle:
      first === undefined ? undefined : textStyle(state.doc, first.pos, first.node, stylesheet),
    marks,
    characterStyles: activeCharacterStyles(state),
    available: {
      paragraph: [...stylesheet.paragraphStyles.keys()],
      character: [...stylesheet.characterStyles.keys()],
      table: [...stylesheet.tableStyles.keys()],
    },
  };
}
