import {
  VARIANT_MARKS,
  isStyleName,
  markAllowed,
  type HeadingLevel,
  type StyleName,
  type Stylesheet,
  type VariantMark,
} from '@phrase/core';
import type { Mark } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { styleOf, textStyle } from './block-styles.js';
import { cellPlace, markActive, selectedBlocks, tableDepth } from './selection.js';

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
  /** The first block is anywhere in a table, so that the commands on the table apply. */
  readonly inTable: boolean;
  /** The level of the first block, when it is a heading. */
  readonly level: HeadingLevel | undefined;
  /** The kind of the innermost list that holds the first block. */
  readonly list: 'bulleted' | 'numbered' | undefined;
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
  /** The labels of the styles that have one (ADR 0034): what people see in place of the name. */
  readonly labels: {
    readonly paragraph: ReadonlyMap<StyleName, string>;
    readonly character: ReadonlyMap<StyleName, string>;
    readonly table: ReadonlyMap<StyleName, string>;
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

function listKind(state: EditorState, pos: number): 'bulleted' | 'numbered' | undefined {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === 'bulletList') return 'bulleted';
    if (name === 'orderedList') return 'numbered';
    // A list around a table is not the list of what is in its cells.
    if (name === 'tableCell' || name === 'tableHeader') return undefined;
  }
  return undefined;
}

function labelsOf(
  styles: ReadonlyMap<StyleName, { readonly label?: string }>,
): ReadonlyMap<StyleName, string> {
  return new Map(
    [...styles].flatMap(([name, { label }]) =>
      label === undefined ? [] : [[name, label] as const],
    ),
  );
}

export function editorContext(state: EditorState, stylesheet: Stylesheet): EditorContext {
  const blocks = selectedBlocks(state);
  const first = blocks[0];
  const kind = first?.node.type.name;
  const place = first === undefined ? undefined : cellPlace(state.doc.resolve(first.pos));
  const block =
    kind === undefined
      ? undefined
      : kind === 'heading'
        ? 'heading'
        : kind === 'codeBlock'
          ? 'code-block'
          : place === 'cell'
            ? 'table-cell'
            : 'paragraph';
  let style: StyleName | undefined;
  if (first !== undefined) {
    const $pos = state.doc.resolve(first.pos);
    style = styleOf(block === 'table-cell' ? $pos.node(tableDepth($pos)) : first.node);
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
  const level: unknown = block === 'heading' ? first?.node.attrs['level'] : undefined;
  return {
    block,
    inTable: place !== undefined,
    level:
      typeof level === 'number' && level >= 1 && level <= 6 ? (level as HeadingLevel) : undefined,
    list: first === undefined ? undefined : listKind(state, first.pos),
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
    labels: {
      paragraph: labelsOf(stylesheet.paragraphStyles),
      character: labelsOf(stylesheet.characterStyles),
      table: labelsOf(stylesheet.tableStyles),
    },
  };
}
