import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface ReferenceTriggerOptions {
  /** Called after an `@` was typed where a reference can start. The `@` is in the text. */
  readonly trigger: (() => void) | undefined;
}

/**
 * Typing `@` at the start of a block or after a space asks for a list of headings (ADR 0071). The
 * `@` is typed as usual, so it stays when the list is closed, and an `@` inside a word, as in a
 * mail address, is only text.
 */
export const ReferenceTrigger = Extension.create<ReferenceTriggerOptions>({
  name: 'referenceTrigger',
  addOptions: () => ({ trigger: undefined }),
  addProseMirrorPlugins() {
    const { trigger } = this.options;
    return [
      new Plugin({
        key: new PluginKey('referenceTrigger'),
        props: {
          handleTextInput(view, from, to, text) {
            if (trigger === undefined || text !== '@' || from !== to) return false;
            const $pos = view.state.doc.resolve(from);
            const block = $pos.parent;
            if (!block.isTextblock || block.type.name === 'codeBlock') return false;
            const before = block.textBetween(Math.max(0, $pos.parentOffset - 1), $pos.parentOffset);
            if (before !== '' && !/\s/.test(before)) return false;
            // The text is put in the document after this returns.
            queueMicrotask(trigger);
            return false;
          },
        },
      }),
    ];
  },
});
