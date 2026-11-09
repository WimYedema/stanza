import { Extension, getChangedRanges } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { VARIANT_MARKS, markAllowed, type StyleName, type Stylesheet } from '@phrase/core';
import { textStyle } from './block-styles.js';
import type { Notice } from './notice.js';
import { normalizePastedHtml } from './paste-html.js';
import { cellPlace } from './selection.js';

export interface PhrasePasteOptions {
  /** The stylesheet in force, read whenever something is pasted. */
  readonly stylesheet: () => Stylesheet;
  readonly notice: (notice: Notice) => void;
}

/**
 * Paste normalisation (ADR 0023). The HTML is cleaned before it is read, and afterwards the marks
 * that the style of the text where it landed does not allow are taken off the pasted text, with a
 * notice. Nothing of what was already there is touched.
 */
export const PhrasePaste = Extension.create<PhrasePasteOptions>({
  name: 'phrasePaste',
  addOptions: () => ({
    stylesheet: () => {
      throw new Error('PhrasePaste needs a stylesheet.');
    },
    notice: () => undefined,
  }),
  addProseMirrorPlugins() {
    const { stylesheet, notice } = this.options;
    return [
      new Plugin({
        key: new PluginKey('phrase-paste'),
        props: {
          transformPastedHTML: (html, view) =>
            normalizePastedHtml(
              html,
              stylesheet(),
              cellPlace(view.state.selection.$from) !== undefined,
            ),
        },
        appendTransaction(transactions, _before, state) {
          const sheet = stylesheet();
          const tr = state.tr;
          const dropped = new Map<StyleName, Set<string>>();
          transactions.forEach((transaction, index) => {
            if (transaction.getMeta('uiEvent') !== 'paste') return;
            const later = transactions.slice(index + 1);
            for (const { newRange } of getChangedRanges(transaction)) {
              const from = later.reduce(
                (pos: number, t: Transaction) => t.mapping.map(pos, -1),
                newRange.from,
              );
              const to = later.reduce(
                (pos: number, t: Transaction) => t.mapping.map(pos, 1),
                newRange.to,
              );
              state.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isTextblock) return true;
                const style = textStyle(state.doc, pos, node, sheet);
                if (style === undefined) return false;
                const start = Math.max(from, pos + 1);
                const end = Math.min(to, pos + node.nodeSize - 1);
                for (const mark of VARIANT_MARKS) {
                  const type = state.schema.marks[mark];
                  if (type === undefined || markAllowed(sheet, style, mark)) continue;
                  if (!state.doc.rangeHasMark(start, end, type)) continue;
                  tr.removeMark(start, end, type);
                  dropped.set(style, (dropped.get(style) ?? new Set()).add(mark));
                }
                return false;
              });
            }
          });
          for (const [style, marks] of dropped) {
            notice({
              code: 'paste-marks-dropped',
              message: `The style "${style}" does not allow ${[...marks].join(', ')}. They were removed from the pasted text.`,
            });
          }
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
