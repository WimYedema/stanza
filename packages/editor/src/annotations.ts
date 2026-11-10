import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as EditorNode } from '@tiptap/pm/model';
import {
  numberHeadings,
  type Block,
  type Diagnostic,
  type HeadingLevel,
  type Stylesheet,
} from '@phrase/core';
import { styleOf } from './block-styles.js';

/**
 * What the editor shows beside the content and does not store in it (ADR 0057): the numbers of the
 * headings, as `numberHeadings` gives them, and a mark on the blocks that the checks of the
 * project have something to say about, with the messages as its tooltip. Both are decorations,
 * computed from the document, so they are never in the text.
 */

export const HEADING_NUMBER_CLASS = 'phrase-heading-number';
export const DIAGNOSTIC_CLASS = 'phrase-diagnostic';

interface State {
  readonly diagnostics: readonly Diagnostic[];
  readonly decorations: DecorationSet;
}

interface Meta {
  /** New diagnostics to show. */
  readonly diagnostics?: readonly Diagnostic[];
}

export const annotationsKey = new PluginKey<State>('phrase-annotations');

/** Recomputes the numbers, for example after the stylesheet has changed. */
export const REFRESH_ANNOTATIONS: Meta = {};

/** The headings of the top level as blocks of the model, which is all that the numbering reads. */
function headingBlocks(doc: EditorNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((node) => {
    if (node.type.name !== 'heading') {
      blocks.push({ type: 'paragraph', content: [] });
      return;
    }
    const style = styleOf(node);
    blocks.push({
      type: 'heading',
      level: Number(node.attrs['level']) as HeadingLevel,
      content: [],
      ...(style !== undefined ? { style } : {}),
    });
  });
  return blocks;
}

/** The block that a diagnostic is about: by its ID when it has one, else by its path. */
function blockOf(
  diagnostic: Diagnostic,
  doc: EditorNode,
  ids: ReadonlyMap<string, { node: EditorNode; pos: number }>,
): { node: EditorNode; pos: number } | undefined {
  if (diagnostic.nodeId !== undefined) return ids.get(diagnostic.nodeId);
  const index = /^blocks\[(\d+)\]/.exec(diagnostic.path ?? '')?.[1];
  if (index === undefined || Number(index) >= doc.childCount) return undefined;
  let pos = 0;
  for (let child = 0; child < Number(index); child += 1) pos += doc.child(child).nodeSize;
  return { node: doc.child(Number(index)), pos };
}

function build(
  doc: EditorNode,
  stylesheet: Stylesheet,
  diagnostics: readonly Diagnostic[],
): DecorationSet {
  const found: Decoration[] = [];

  const labels = numberHeadings(
    { meta: { fields: {} }, blocks: headingBlocks(doc) },
    stylesheet,
  ).labels;
  let pos = 0;
  doc.forEach((node, _offset, index) => {
    const label = labels[index];
    if (label !== undefined) {
      found.push(
        Decoration.widget(
          pos + 1,
          (view) => {
            const span = view.dom.ownerDocument.createElement('span');
            span.className = HEADING_NUMBER_CLASS;
            span.setAttribute('contenteditable', 'false');
            span.textContent = label;
            return span;
          },
          { side: -1, key: `number:${label}`, ignoreSelection: true },
        ),
      );
    }
    pos += node.nodeSize;
  });

  if (diagnostics.length > 0) {
    const ids = new Map<string, { node: EditorNode; pos: number }>();
    doc.descendants((node, at) => {
      const id: unknown = node.attrs['id'];
      if (typeof id === 'string') ids.set(id, { node, pos: at });
    });
    const byBlock = new Map<number, { node: EditorNode; list: Diagnostic[] }>();
    for (const diagnostic of diagnostics) {
      const block = blockOf(diagnostic, doc, ids);
      if (block === undefined) continue;
      const entry = byBlock.get(block.pos) ?? { node: block.node, list: [] };
      entry.list.push(diagnostic);
      byBlock.set(block.pos, entry);
    }
    for (const [at, { node, list }] of byBlock) {
      const severity = list.some((d) => d.severity === 'error') ? 'error' : 'warning';
      found.push(
        Decoration.node(at, at + node.nodeSize, {
          class: `${DIAGNOSTIC_CLASS} ${DIAGNOSTIC_CLASS}-${severity}`,
          title: list.map((d) => d.message).join('\n'),
        }),
      );
    }
  }
  return DecorationSet.create(doc, found);
}

export interface AnnotationsOptions {
  /** The stylesheet in force, read whenever the numbers are computed. */
  readonly stylesheet: () => Stylesheet;
}

export const Annotations = Extension.create<AnnotationsOptions>({
  name: 'annotations',
  addOptions: () => ({
    stylesheet: () => {
      throw new Error('Annotations needs a stylesheet.');
    },
  }),
  addProseMirrorPlugins() {
    const { stylesheet } = this.options;
    return [
      new Plugin<State>({
        key: annotationsKey,
        state: {
          init: (_config, state) => ({
            diagnostics: [],
            decorations: build(state.doc, stylesheet(), []),
          }),
          apply: (tr, previous, _old, state) => {
            const meta = tr.getMeta(annotationsKey) as Meta | undefined;
            if (!tr.docChanged && meta === undefined) return previous;
            const diagnostics = meta?.diagnostics ?? previous.diagnostics;
            return { diagnostics, decorations: build(state.doc, stylesheet(), diagnostics) };
          },
        },
        props: { decorations: (state) => annotationsKey.getState(state)?.decorations },
      }),
    ];
  },
});
