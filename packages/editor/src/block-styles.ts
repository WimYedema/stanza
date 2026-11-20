import {
  BODY_STYLE,
  LIST_STYLES,
  RESERVED_TABLE_STYLE,
  VARIANT_MARKS,
  defaultHeadingStyle,
  isStyleName,
  markAllowed,
  resolveTableStyle,
  type StyleName,
  type Stylesheet,
  type VariantMark,
} from '@stanza/core';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { cellPlace, tableDepth } from './selection.js';

/**
 * Which style a block of text has, and so which marks it may carry (ADR 0006, ADR 0023). The
 * answer depends on the context of the block: a list item takes the style of its list, and a table
 * cell the cell style of its table.
 */

/** The style a node names itself, if it is a declared kind of name. */
export const styleOf = (node: EditorNode): StyleName | undefined => {
  const value: unknown = node.attrs['style'];
  return typeof value === 'string' && isStyleName(value) ? value : undefined;
};

/** The style of the list a list item is in: its own, or the default of its kind. */
export const listStyleOf = (list: EditorNode): StyleName =>
  styleOf(list) ?? LIST_STYLES[list.type.name === 'bulletList' ? 'bulleted' : 'numbered'];

/**
 * The style that decides which marks a block of text may carry, or undefined for a block that
 * takes no marks. `own` stands in for the style of the node itself, to ask what a change would do.
 */
export function textStyle(
  doc: EditorNode,
  pos: number,
  node: EditorNode,
  stylesheet: Stylesheet,
  own: StyleName | undefined = styleOf(node),
): StyleName | undefined {
  const $pos = doc.resolve(pos);
  switch (node.type.name) {
    case 'heading':
      return own ?? defaultHeadingStyle(Number(node.attrs['level']));
    case 'paragraph': {
      const parent = $pos.parent.type.name;
      if (parent === 'listItem') return own ?? listStyleOf($pos.node($pos.depth - 1));
      if (cellPlace($pos) === 'cell') {
        // A paragraph of a cell has no style of its own: it takes the cell style of its table.
        const table = $pos.node(tableDepth($pos));
        const name = styleOf(table) ?? RESERVED_TABLE_STYLE;
        return resolveTableStyle(stylesheet, name)?.cellStyle ?? BODY_STYLE;
      }
      return own ?? BODY_STYLE;
    }
    default:
      return undefined;
  }
}

/** The marks of a block that a style can allow or refuse. Character styles are always allowed. */
export function variantMarksOf(node: EditorNode): ReadonlySet<VariantMark> {
  const found = new Set<VariantMark>();
  node.forEach((child) => {
    for (const mark of child.marks) {
      const name = VARIANT_MARKS.find((candidate) => candidate === mark.type.name);
      if (name !== undefined) found.add(name);
    }
  });
  return found;
}

/** How many blocks carry a mark that their style does not allow, by style and mark. */
export function violations(doc: EditorNode, stylesheet: Stylesheet): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const allowed = new Map<string, boolean>();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const style = textStyle(doc, pos, node, stylesheet);
    if (style === undefined) return false;
    for (const mark of variantMarksOf(node)) {
      const key = `${style}\u0000${mark}`;
      let ok = allowed.get(key);
      if (ok === undefined) {
        ok = markAllowed(stylesheet, style, mark);
        allowed.set(key, ok);
      }
      if (!ok) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return false;
  });
  return counts;
}

export interface Violation {
  readonly style: StyleName;
  readonly mark: VariantMark;
}

/** What an edit adds to the marks that a style does not allow, so existing ones do not count. */
export function introducedViolations(
  before: EditorNode,
  after: EditorNode,
  stylesheet: Stylesheet,
): readonly Violation[] {
  const previous = violations(before, stylesheet);
  const introduced: Violation[] = [];
  for (const [key, count] of violations(after, stylesheet)) {
    if (count <= (previous.get(key) ?? 0)) continue;
    const [style = '', mark = ''] = key.split('\u0000');
    const name = VARIANT_MARKS.find((candidate) => candidate === mark);
    if (isStyleName(style) && name !== undefined) introduced.push({ style, mark: name });
  }
  return introduced;
}
