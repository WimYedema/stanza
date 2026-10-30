import { Extension } from '@tiptap/core';
import { splitListItem } from '@tiptap/pm/schema-list';
import type { Stylesheet } from '@phrase/core';
import { runCommand, type EditorCommand } from './commands.js';
import type { Notice } from './notice.js';

export interface PhraseKeysOptions {
  /** The stylesheet in force, read whenever a key is pressed. */
  readonly stylesheet: () => Stylesheet;
  readonly notice: (notice: Notice) => void;
}

/**
 * The keys of the editor (ADR 0023): marks, and the keys that make a list work. They run the same
 * commands as any other way of giving one. A command that is refused is swallowed and reported as a
 * notice, so the key does nothing else.
 */
export const PhraseKeys = Extension.create<PhraseKeysOptions>({
  name: 'phraseKeys',
  // Before the keys of the library, which would split a list item into two paragraphs.
  priority: 1000,
  addOptions: () => ({
    stylesheet: () => {
      throw new Error('PhraseKeys needs a stylesheet.');
    },
    notice: () => undefined,
  }),
  addKeyboardShortcuts() {
    const { stylesheet, notice } = this.options;
    const editor = this.editor;

    /** Always true, so that the key does nothing else. A command that has no place is silent. */
    const run = (command: EditorCommand, silent = false): boolean => {
      const result = runCommand(
        editor.state,
        (tr) => {
          editor.view.dispatch(tr);
        },
        command,
        stylesheet(),
      );
      if (!result.ok && !(silent && result.reason === 'not-applicable')) {
        notice({ code: result.reason, message: result.message });
      }
      return true;
    };

    const inListItem = (): boolean => {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name === 'listItem') return true;
      }
      return false;
    };

    return {
      'Mod-b': () => run({ type: 'toggle-mark', mark: 'strong' }),
      'Mod-i': () => run({ type: 'toggle-mark', mark: 'emphasis' }),
      'Mod-e': () => run({ type: 'toggle-mark', mark: 'code' }),
      Enter: () => {
        const item = editor.state.schema.nodes['listItem'];
        if (item === undefined || !inListItem()) return false;
        return splitListItem(item)(editor.state, (tr) => {
          editor.view.dispatch(tr);
        });
      },
      Backspace: () => {
        const { selection } = editor.state;
        const { $from } = selection;
        const atStart =
          selection.empty &&
          $from.parentOffset === 0 &&
          $from.parent.type.name === 'paragraph' &&
          $from.depth > 1 &&
          $from.node($from.depth - 1).type.name === 'listItem' &&
          $from.index($from.depth - 1) === 0;
        return atStart ? run({ type: 'lift-list-item' }) : false;
      },
      Tab: () => (inListItem() ? run({ type: 'sink-list-item' }, true) : false),
      'Shift-Tab': () => (inListItem() ? run({ type: 'lift-list-item' }, true) : false),
    };
  },
});
