import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as EditorNode } from '@tiptap/pm/model';
import {
  BODY_STYLE,
  CODE_STYLE,
  LIST_STYLES,
  RESERVED_TABLE_STYLE,
  defaultHeadingStyle,
  resolveTableStyle,
  type HeadingLevel,
  type StyleName,
  type Stylesheet,
} from '@phrase/core';
import { listItemClass, paragraphClass, tableClass } from '@phrase/css';
import { styleOf } from './block-styles.js';

/**
 * Puts the classes of ADR 0021 on the blocks of the editor (ADR 0022). A class depends on the
 * context of a block: a list item takes its look from its list, and a table cell from its table.
 * That is why the classes are decorations, computed from the document and the stylesheet, and are
 * never stored in the document.
 */

const stylesKey = new PluginKey<DecorationSet>('phrase-context-classes');

/** Recomputes the classes, for example after the stylesheet has changed. */
export const REFRESH_CLASSES = 'refresh';

interface Context {
  readonly parent: EditorNode;
  readonly index: number;
  /** The paragraph style of the cells of the table this block is in. */
  readonly cellStyle: StyleName;
  /** The style of the list this block is in. */
  readonly listStyle: StyleName | undefined;
}

function decorations(doc: EditorNode, stylesheet: Stylesheet): DecorationSet {
  const found: Decoration[] = [];
  const add = (node: EditorNode, pos: number, name: StyleName, build: (n: StyleName) => string) => {
    found.push(Decoration.node(pos, pos + node.nodeSize, { class: build(name) }));
  };

  const visit = (node: EditorNode, pos: number, context: Context): void => {
    let inner: Context = { ...context };
    switch (node.type.name) {
      case 'heading': {
        const level = Number(node.attrs['level']) as HeadingLevel;
        add(node, pos, styleOf(node) ?? defaultHeadingStyle(level), paragraphClass);
        break;
      }
      case 'paragraph':
        // The first paragraph of a list item takes its look from the item.
        if (context.parent.type.name === 'listItem' && context.index === 0) break;
        if (context.parent.type.name === 'listItem' && styleOf(node) === undefined) break;
        add(node, pos, styleOf(node) ?? BODY_STYLE, paragraphClass);
        break;
      case 'codeBlock':
        add(node, pos, styleOf(node) ?? CODE_STYLE, paragraphClass);
        break;
      case 'bulletList':
      case 'orderedList':
        inner = {
          ...inner,
          listStyle:
            styleOf(node) ?? LIST_STYLES[node.type.name === 'bulletList' ? 'bulleted' : 'numbered'],
        };
        break;
      case 'listItem': {
        const first = node.firstChild;
        const own = first?.type.name === 'paragraph' ? styleOf(first) : undefined;
        add(node, pos, own ?? context.listStyle ?? LIST_STYLES.bulleted, listItemClass);
        break;
      }
      case 'table': {
        const name = styleOf(node) ?? RESERVED_TABLE_STYLE;
        add(node, pos, name, tableClass);
        inner = {
          ...inner,
          cellStyle: resolveTableStyle(stylesheet, name)?.cellStyle ?? BODY_STYLE,
        };
        break;
      }
      case 'tableCell':
      case 'tableHeader':
        add(node, pos, context.cellStyle, paragraphClass);
        break;
    }
    node.forEach((child, offset, index) => {
      visit(child, pos + 1 + offset, { ...inner, parent: node, index });
    });
  };

  doc.forEach((child, offset, index) => {
    visit(child, offset, {
      parent: doc,
      index,
      cellStyle: BODY_STYLE,
      listStyle: undefined,
    });
  });
  return DecorationSet.create(doc, found);
}

export interface ContextClassesOptions {
  /** The stylesheet in force, read whenever the classes are computed. */
  readonly stylesheet: () => Stylesheet;
}

export const ContextClasses = Extension.create<ContextClassesOptions>({
  name: 'contextClasses',
  addOptions: () => ({
    stylesheet: () => {
      throw new Error('ContextClasses needs a stylesheet.');
    },
  }),
  addProseMirrorPlugins() {
    const { stylesheet } = this.options;
    return [
      new Plugin<DecorationSet>({
        key: stylesKey,
        state: {
          init: (_config, state) => decorations(state.doc, stylesheet()),
          apply: (tr, previous, _old, state) =>
            tr.docChanged || tr.getMeta(stylesKey) === REFRESH_CLASSES
              ? decorations(state.doc, stylesheet())
              : previous,
        },
        props: { decorations: (state) => stylesKey.getState(state) },
      }),
    ];
  },
});

export { stylesKey as contextClassesKey };
