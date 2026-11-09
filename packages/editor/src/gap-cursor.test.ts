// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { GapCursor as GapCursorSelection } from '@tiptap/pm/gapcursor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { phraseExtensions } from './editor.js';
import { COMMANDS_STYLESHEET } from './styles.testing.js';

const stylesheet = COMMANDS_STYLESHEET.stylesheet;

let element: HTMLElement;
let editor: Editor | undefined;

beforeEach(() => {
  element = document.createElement('div');
  document.body.append(element);
});
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  element.remove();
});

const table = {
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        {
          type: 'tableHeader',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }],
        },
      ],
    },
  ],
};

function open(...blocks: object[]): Editor {
  editor = new Editor({
    element,
    extensions: phraseExtensions(
      () => stylesheet,
      () => undefined,
    ),
    content: { type: 'doc', content: blocks },
  });
  return editor;
}

describe('the gap cursor', () => {
  it('can stand before a table that is the first block', () => {
    const current = open(table);
    current.view.dispatch(
      current.state.tr.setSelection(new GapCursorSelection(current.state.doc.resolve(0))),
    );
    expect(current.state.selection).toBeInstanceOf(GapCursorSelection);
  });

  it('can stand after a table that is the last block', () => {
    const current = open(table);
    const end = current.state.doc.content.size;
    current.view.dispatch(
      current.state.tr.setSelection(new GapCursorSelection(current.state.doc.resolve(end))),
    );
    expect(current.state.selection).toBeInstanceOf(GapCursorSelection);
  });

  it('makes a paragraph of the text typed before the table', () => {
    const current = open(table);
    current.view.dispatch(
      current.state.tr.setSelection(new GapCursorSelection(current.state.doc.resolve(0))),
    );
    current.view.dom.dispatchEvent(
      new InputEvent('beforeinput', {
        data: 'x',
        inputType: 'insertCompositionText',
        bubbles: true,
        cancelable: true,
      }),
    );
    const blocks = current.state.doc.children.map((node) => node.type.name);
    expect(blocks).toEqual(['paragraph', 'table']);
  });
});
