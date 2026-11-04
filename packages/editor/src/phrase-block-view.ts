import { Extension } from '@tiptap/core';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';
import {
  TOC_PHRASE_KIND,
  collectTocEntries,
  numberHeadings,
  readTocOptions,
  tocStyleName,
  type Block,
  type HeadingLevel,
  type Stylesheet,
} from '@phrase/core';
import { paragraphClass } from '@phrase/css';
import { styleOf } from './block-styles.js';
import { PHRASE_BLOCK_CLASS } from './schema.js';

/**
 * How a phrase block looks in the editor: a box with a name. A table of contents shows its entries
 * as they would be written, from the headings of the document and the numbers of the stylesheet,
 * without page numbers (Word adds them, ADR 0018). This is a view of the document and is never
 * stored in it, and the blocks themselves are kept as they are.
 */

export const PHRASE_BLOCK_LABEL_CLASS = 'phrase-block-label';
export const PHRASE_BLOCK_EMPTY_CLASS = 'phrase-block-empty';

const HEADING_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6];

/** The blocks of the document as far as the entries need them: the headings, in their places. */
function headingBlocks(doc: EditorNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((node) => {
    const level: unknown = node.attrs['level'];
    if (
      node.type.name !== 'heading' ||
      typeof level !== 'number' ||
      !HEADING_LEVELS.includes(level)
    ) {
      blocks.push({ type: 'paragraph', content: [] });
      return;
    }
    const style = styleOf(node);
    blocks.push({
      type: 'heading',
      level: level as HeadingLevel,
      ...(style !== undefined ? { style } : {}),
      content: [{ type: 'text', text: node.textContent, marks: [] }],
    });
  });
  return blocks;
}

function drawToc(
  root: HTMLElement,
  node: EditorNode,
  doc: EditorNode,
  stylesheet: Stylesheet,
): void {
  const { depth } = readTocOptions(String(node.attrs['text'])).options;
  const blocks = headingBlocks(doc);
  const { labels } = numberHeadings({ meta: { fields: {} }, blocks }, stylesheet);
  const entries = collectTocEntries(blocks, labels, depth);
  const owner = root.ownerDocument;

  const label = owner.createElement('div');
  label.className = PHRASE_BLOCK_LABEL_CLASS;
  const pages = stylesheet.tableOfContents.pageNumbers ? ', page numbers added by Word' : '';
  label.textContent = `Table of contents (down to level ${String(depth)}${pages})`;
  root.replaceChildren(label);

  if (entries.length === 0) {
    const empty = owner.createElement('div');
    empty.className = PHRASE_BLOCK_EMPTY_CLASS;
    empty.textContent = 'No headings yet.';
    root.append(empty);
    return;
  }
  for (const entry of entries) {
    const line = owner.createElement('p');
    line.className = paragraphClass(tocStyleName(entry.level));
    line.textContent = entry.text;
    root.append(line);
  }
}

function draw(root: HTMLElement, node: EditorNode, doc: EditorNode, stylesheet: Stylesheet): void {
  const kind = String(node.attrs['kind']);
  if (kind === TOC_PHRASE_KIND) drawToc(root, node, doc, stylesheet);
  else root.textContent = `Phrase block "${kind}"`;
}

export interface PhraseBlockViewOptions {
  /** The stylesheet in force, read whenever a block is drawn. */
  readonly stylesheet: () => Stylesheet;
}

export const PhraseBlockView = Extension.create<PhraseBlockViewOptions>({
  name: 'phraseBlockView',
  addOptions: () => ({
    stylesheet: () => {
      throw new Error('PhraseBlockView needs a stylesheet.');
    },
  }),
  addProseMirrorPlugins() {
    const { stylesheet } = this.options;
    // The blocks that are on the screen, which the headings and the stylesheet can change.
    const drawn = new Map<NodeView, { root: HTMLElement; node: () => EditorNode }>();
    let drawnWith: Stylesheet | undefined;

    return [
      new Plugin({
        key: new PluginKey('phrase-block-view'),
        props: {
          nodeViews: {
            phraseBlock: (initial, view) => {
              const root = view.dom.ownerDocument.createElement('div');
              root.className = PHRASE_BLOCK_CLASS;
              let current = initial;
              draw(root, current, view.state.doc, stylesheet());
              const nodeView: NodeView = {
                dom: root,
                update: (next) => {
                  if (next.type !== current.type) return false;
                  current = next;
                  draw(root, current, view.state.doc, stylesheet());
                  return true;
                },
                ignoreMutation: () => true,
                destroy: () => {
                  drawn.delete(nodeView);
                },
              };
              drawn.set(nodeView, { root, node: () => current });
              return nodeView;
            },
          },
        },
        view: () => ({
          update: (view, previous) => {
            const sheet = stylesheet();
            if (view.state.doc === previous.doc && sheet === drawnWith) return;
            drawnWith = sheet;
            for (const { root, node } of drawn.values()) {
              draw(root, node(), view.state.doc, sheet);
            }
          },
        }),
      }),
    ];
  },
});
