// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { phraseExtensions } from './editor.js';
import { COMMANDS_STYLESHEET } from './styles.testing.js';

const stylesheet = COMMANDS_STYLESHEET.stylesheet;
const trigger = vi.fn<() => void>();

let element: HTMLElement;
let editor: Editor;

const text = (value: string) => ({ type: 'text', text: value });
const open = (...blocks: object[]): void => {
  editor = new Editor({
    element,
    extensions: phraseExtensions(() => stylesheet, vi.fn(), undefined, trigger),
    content: { type: 'doc', content: blocks },
  });
};

/** Types a character at a position of the text as the browser would: the handlers first. */
function type(character: string, at: number): void {
  const { view } = editor;
  const handled = view.someProp('handleTextInput', (handler) =>
    handler(view, at, at, character, () => view.state.tr.insertText(character, at, at)),
  );
  if (handled !== true) view.dispatch(view.state.tr.insertText(character, at, at));
}

/** The position in the document of an offset in the first block. */
const at = (offset: number): number => 1 + offset;

beforeEach(() => {
  element = document.createElement('div');
  document.body.append(element);
  trigger.mockClear();
});
afterEach(() => {
  editor.destroy();
  element.remove();
});

describe('typing @', () => {
  it('asks for the list at the start of a block, and after a space', async () => {
    open({ type: 'paragraph', content: [text('See  there')] });
    type('@', at(0));
    type('@', at(5));
    await Promise.resolve();
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('types the @ as usual, so that it stays', async () => {
    open({ type: 'paragraph', content: [text('See ')] });
    type('@', at(4));
    await Promise.resolve();
    expect(editor.state.doc.textContent).toBe('See @');
  });

  it('is only text inside a word, as in a mail address', async () => {
    open({ type: 'paragraph', content: [text('mail me')] });
    type('@', at(4));
    await Promise.resolve();
    expect(trigger).not.toHaveBeenCalled();
    expect(editor.state.doc.textContent).toBe('mail@ me');
  });

  it('is only text in a code block, and for other characters', async () => {
    open(
      { type: 'codeBlock', attrs: {}, content: [text('a b')] },
      { type: 'paragraph', content: [text('x ')] },
    );
    type('@', 1 + 2);
    const second = 1 + 'a b'.length + 1 + 1;
    type('#', second);
    await Promise.resolve();
    expect(trigger).not.toHaveBeenCalled();
  });

  it('does nothing when no one is listening', async () => {
    editor.destroy();
    editor = new Editor({
      element,
      extensions: phraseExtensions(() => stylesheet, vi.fn()),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [text('a ')] }] },
    });
    type('@', at(2));
    await Promise.resolve();
    expect(editor.state.doc.textContent).toBe('a @');
  });
});
