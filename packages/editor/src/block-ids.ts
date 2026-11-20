import { isNodeId, needsId } from '@stanza/core';
import { Extension, getChangedRanges } from '@tiptap/core';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { Notice } from './notice.js';

/** Where new IDs come from, and which are already taken elsewhere in the project (ADR 0024). */
export interface IdSource {
  /** A candidate ID. A candidate that is taken is not used. */
  readonly newId: () => string;
  /** The IDs of the other documents of the project. */
  readonly usedIds: () => ReadonlySet<string>;
}

export interface BlockIdsOptions extends IdSource {
  readonly notice: (notice: Notice) => void;
}

const ATTEMPTS = 20;

interface Block {
  readonly node: EditorNode;
  readonly pos: number;
  readonly touched: boolean;
}

/** The ranges of the final document that the transactions changed. */
function changedRanges(
  transactions: readonly Transaction[],
): readonly (readonly [number, number])[] {
  const ranges: [number, number][] = [];
  transactions.forEach((transaction, index) => {
    const later = transactions.slice(index + 1);
    for (const { newRange } of getChangedRanges(transaction)) {
      const from = later.reduce((pos, t) => t.mapping.map(pos, -1), newRange.from);
      const to = later.reduce((pos, t) => t.mapping.map(pos, 1), newRange.to);
      ranges.push([from, to]);
    }
  });
  return ranges;
}

/**
 * IDs of blocks (ADR 0001, ADR 0024). An ID belongs to one block: when an edit has left it on two,
 * the first keeps it, which is the original of a split. A heading or table that an edit created or
 * changed, and has no ID, gets a new one. Nothing else is touched, an ID is never changed, and
 * loading a document does nothing, so that opening a file does not rewrite it (ADR 0003).
 */
export const BlockIds = Extension.create<BlockIdsOptions>({
  name: 'blockIds',
  addOptions: () => ({
    newId: () => {
      throw new Error('BlockIds needs a source of IDs.');
    },
    usedIds: () => new Set<string>(),
    notice: () => undefined,
  }),
  addProseMirrorPlugins() {
    const { newId, usedIds, notice } = this.options;
    return [
      new Plugin({
        key: new PluginKey('stanza-block-ids'),
        appendTransaction(transactions, _before, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          if (transactions.some((transaction) => transaction.getMeta('preventUpdate') === true)) {
            return null;
          }
          const ranges = changedRanges(transactions);
          const blocks: Block[] = [];
          state.doc.descendants((node, pos) => {
            if (!('id' in node.attrs)) return;
            const touched = ranges.some(([from, to]) => pos < to && pos + node.nodeSize > from);
            blocks.push({ node, pos, touched });
          });
          const idOf = (block: Block): string | null => {
            const value: unknown = block.node.attrs['id'];
            return typeof value === 'string' ? value : null;
          };

          const tr = state.tr;
          const cleared = new Set<number>();
          const byId = new Map<string, Block[]>();
          for (const block of blocks) {
            const id = idOf(block);
            if (id !== null) byId.set(id, [...(byId.get(id) ?? []), block]);
          }
          for (const group of byId.values()) {
            if (group.length < 2 || !group.some((block) => block.touched)) continue;
            for (const block of group.slice(1)) {
              tr.setNodeAttribute(block.pos, 'id', null);
              cleared.add(block.pos);
            }
          }

          const taken = new Set(usedIds());
          for (const block of blocks) {
            const id = idOf(block);
            if (id !== null && !cleared.has(block.pos)) taken.add(id);
          }
          let failed = false;
          for (const block of blocks) {
            const missing = idOf(block) === null || cleared.has(block.pos);
            if (!missing || !(block.touched || cleared.has(block.pos))) continue;
            // The names of these blocks in the editor are those of the model.
            if (!needsId({ type: block.node.type.name })) continue;
            let found: string | undefined;
            for (let attempt = 0; attempt < ATTEMPTS && found === undefined; attempt += 1) {
              const candidate = newId();
              if (!isNodeId(candidate)) throw new Error(`The ID source gave "${candidate}".`);
              if (!taken.has(candidate)) found = candidate;
            }
            if (found === undefined) {
              failed = true;
              continue;
            }
            taken.add(found);
            tr.setNodeAttribute(block.pos, 'id', found);
          }
          if (failed) {
            notice({
              code: 'id-generation-failed',
              message: `No unused ID was found after ${String(ATTEMPTS)} attempts. The block has no ID yet.`,
            });
          }
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
