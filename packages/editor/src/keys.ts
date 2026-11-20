import { Extension } from '@tiptap/core';
import { splitListItem } from '@tiptap/pm/schema-list';
import type { Stylesheet } from '@stanza/core';
import { runCommand, type EditorCommand } from './commands.js';
import type { Notice } from './notice.js';

export interface StanzaKeysOptions {
  /** The stylesheet in force, read whenever a key is pressed. */
  readonly stylesheet: () => Stylesheet;
  readonly notice: (notice: Notice) => void;
}

/**
 * The keys of the editor (ADR 0023, 0027): marks, headings, and the keys that make a list work. They run the same
 * commands as any other way of giving one. A command that is refused is swallowed and reported as a
 * notice, so the key does nothing else.
 */
export const StanzaKeys = Extension.create<StanzaKeysOptions>({
  name: 'stanzaKeys',
  // Before the keys of the library, which would split a list item into two paragraphs.
  priority: 1000,
  addOptions: () => ({
    stylesheet: () => {
      throw new Error('StanzaKeys needs a stylesheet.');
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
        const name = $from.node(depth).type.name;
        if (name === 'listItem') return true;
        // A table in a list item has cells of its own, with the keys of a table.
        if (name === 'tableCell' || name === 'tableHeader') return false;
      }
      return false;
    };

    return {
      'Mod-Alt-0': () => run({ type: 'set-paragraph' }),
      'Mod-Alt-1': () => run({ type: 'set-heading', level: 1 }),
      'Mod-Alt-2': () => run({ type: 'set-heading', level: 2 }),
      'Mod-Alt-3': () => run({ type: 'set-heading', level: 3 }),
      'Mod-Alt-4': () => run({ type: 'set-heading', level: 4 }),
      'Mod-Alt-5': () => run({ type: 'set-heading', level: 5 }),
      'Mod-Alt-6': () => run({ type: 'set-heading', level: 6 }),
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
        if (selection.empty && $from.parentOffset === 0 && $from.parent.type.name === 'heading') {
          return run({ type: 'set-paragraph' });
        }
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
