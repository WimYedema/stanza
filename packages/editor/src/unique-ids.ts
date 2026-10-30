import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * An ID belongs to one block (ADR 0001). Splitting a block in the middle copies its attributes to
 * both halves, so afterwards the later block of a duplicated ID loses it. The first block, which
 * is the original in a split, keeps it. Assigning a new ID is the work of the unique-ID item.
 */
export const UniqueIds = Extension.create({
  name: 'uniqueIds',
  addProseMirrorPlugins: () => [
    new Plugin({
      key: new PluginKey('phrase-unique-ids'),
      appendTransaction(transactions, _before, state) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        const seen = new Set<string>();
        const tr = state.tr;
        state.doc.descendants((node, pos) => {
          const id: unknown = node.attrs['id'];
          if (typeof id !== 'string') return;
          if (seen.has(id)) tr.setNodeAttribute(pos, 'id', null);
          else seen.add(id);
        });
        return tr.docChanged ? tr : null;
      },
    }),
  ],
});
