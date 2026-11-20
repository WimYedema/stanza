// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stanzaExtensions } from './editor.js';
import type { Notice } from './notice.js';
import { COMMANDS_STYLESHEET } from './styles.testing.js';

const stylesheet = COMMANDS_STYLESHEET.stylesheet;

let element: HTMLElement;
let editor: Editor | undefined;
let notices: Notice[];

beforeEach(() => {
  element = document.createElement('div');
  document.body.append(element);
  notices = [];
});
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  element.remove();
});

function open(...blocks: object[]): Editor {
  editor = new Editor({
    element,
    extensions: stanzaExtensions(
      () => stylesheet,
      (notice) => notices.push(notice),
    ),
    content: { type: 'doc', content: blocks },
  });
  return editor;
}

function press(key: string, options: KeyboardEventInit = {}): void {
  editor?.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  );
}

const text = (value: string, marks: object[] = []) => ({ type: 'text', text: value, marks });

interface Run {
  text?: string;
  marks?: { type: string }[];
}
/** The runs of text of a block, as the editor writes them down. */
const runsOf = (current: Editor, block = 0): Run[] =>
  (current.getJSON() as unknown as { content: { content?: Run[] }[] }).content[block]?.content ??
  [];
const paragraph = (value: string, attrs: object = {}) => ({
  type: 'paragraph',
  attrs,
  content: [text(value)],
});
const bullets = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
});

function positionOf(current: Editor, value: string, offset = 0): number {
  let found = -1;
  current.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value) === true) {
      found = pos + node.text.indexOf(value) + offset;
    }
  });
  return found;
}

const shape = (current: Editor): string =>
  JSON.stringify(current.state.doc.toJSON(), (key, value: unknown) =>
    key === 'attrs' || key === 'marks' ? undefined : value,
  );

describe('the keys of the editor', () => {
  it('marks the selection with Mod-b, Mod-i and Mod-e', () => {
    const current = open(paragraph('Some text here'));
    current.commands.setTextSelection({
      from: positionOf(current, 'text'),
      to: positionOf(current, 'text') + 4,
    });
    press('b', { ctrlKey: true });
    press('i', { ctrlKey: true });
    press('e', { ctrlKey: true });
    const marked = runsOf(current).find((node) => node.text === 'text');
    expect(marked?.marks?.map((mark) => mark.type)).toEqual(['strong', 'emphasis', 'code']);
  });

  it('swallows a mark that the style does not allow, and says why', () => {
    const current = open(paragraph('Some text', { style: 'plain' }));
    current.commands.setTextSelection({
      from: positionOf(current, 'text'),
      to: positionOf(current, 'text') + 4,
    });
    press('b', { ctrlKey: true });
    expect(runsOf(current)).toHaveLength(1);
    expect(notices).toEqual([
      { code: 'mark-not-allowed', message: 'The style "plain" does not allow strong.' },
    ]);
  });

  it('makes a new item with Enter, and ends the list at an empty item', () => {
    const current = open(bullets('One'));
    current.commands.setTextSelection(positionOf(current, 'One', 3));
    press('Enter');
    expect(current.state.doc.firstChild?.childCount).toBe(2);
    // The new item is empty and the last, so Enter again takes it out of the list.
    press('Enter');
    expect(current.state.doc.firstChild?.childCount).toBe(1);
    expect(current.state.doc.childCount).toBe(2);
    expect(current.state.doc.child(1).type.name).toBe('paragraph');
  });

  it('nests an item with Tab, and takes it out with Shift-Tab', () => {
    const current = open(bullets('One', 'Two'));
    current.commands.setTextSelection(positionOf(current, 'Two', 1));
    press('Tab');
    expect(shape(current)).toContain(
      '"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"One"}]},{"type":"bulletList"',
    );
    press('Tab', { shiftKey: true });
    expect(current.state.doc.firstChild?.childCount).toBe(2);
    expect(notices).toEqual([]);
  });

  it('does nothing and says nothing for Tab on the first item', () => {
    const current = open(bullets('One', 'Two'));
    current.commands.setTextSelection(positionOf(current, 'One', 1));
    const before = shape(current);
    press('Tab');
    expect(shape(current)).toBe(before);
    expect(notices).toEqual([]);
  });

  it('makes a paragraph or a heading of the block with Mod-Alt and a digit', () => {
    const current = open(
      { type: 'heading', attrs: { level: 1 }, content: [text('Top')] },
      paragraph('Some text'),
    );
    current.commands.setTextSelection(positionOf(current, 'text'));
    press('2', { ctrlKey: true, altKey: true });
    expect(current.state.doc.child(1).type.name).toBe('heading');
    expect(current.state.doc.child(1).attrs['level']).toBe(2);
    press('1', { ctrlKey: true, altKey: true });
    expect(current.state.doc.child(1).attrs['level']).toBe(1);
    press('0', { ctrlKey: true, altKey: true });
    expect(current.state.doc.child(1).type.name).toBe('paragraph');
    expect(notices).toEqual([]);
  });

  it('refuses a heading that skips a level, and says why', () => {
    const current = open(
      { type: 'heading', attrs: { level: 1 }, content: [text('Top')] },
      paragraph('Some text'),
    );
    current.commands.setTextSelection(positionOf(current, 'text'));
    press('3', { ctrlKey: true, altKey: true });
    expect(current.state.doc.child(1).type.name).toBe('paragraph');
    expect(notices.map((notice) => notice.code)).toEqual(['heading-level']);
  });

  it('refuses a heading that would leave marks its style does not allow, and says why', () => {
    const current = open(
      { type: 'heading', attrs: { level: 5 }, content: [text('Top')] },
      { type: 'paragraph', content: [text('Some '), text('bold', [{ type: 'strong' }])] },
    );
    current.commands.setTextSelection(positionOf(current, 'Some'));
    press('6', { ctrlKey: true, altKey: true });
    expect(current.state.doc.child(1).type.name).toBe('paragraph');
    expect(notices.map((notice) => notice.code)).toEqual(['marks-not-allowed']);
  });

  it('makes a paragraph of a heading with Backspace at its start, keeping the text', () => {
    const current = open({
      type: 'heading',
      attrs: { level: 2, id: 'k7m2q9x4zb' },
      content: [text('Title')],
    });
    current.commands.setTextSelection(positionOf(current, 'Title'));
    press('Backspace');
    expect(current.state.doc.child(0).type.name).toBe('paragraph');
    expect(current.state.doc.child(0).attrs['id']).toBe('k7m2q9x4zb');
    expect(current.state.doc.child(0).textContent).toBe('Title');
  });

  it('leaves Backspace inside a heading to the editor', () => {
    const current = open({ type: 'heading', attrs: { level: 2 }, content: [text('Title')] });
    current.commands.setTextSelection(positionOf(current, 'Title', 2));
    press('Backspace');
    expect(current.state.doc.child(0).type.name).toBe('heading');
    expect(notices).toEqual([]);
  });

  it('takes the first item out of its list with Backspace at its start', () => {
    const current = open(bullets('One', 'Two'));
    current.commands.setTextSelection(positionOf(current, 'One'));
    press('Backspace');
    expect(current.state.doc.child(0).type.name).toBe('paragraph');
    expect(current.state.doc.child(1).type.name).toBe('bulletList');
  });

  it('splits a paragraph of a cell into two paragraphs of the same cell with Enter', () => {
    const current = open({
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('ab')] }] }],
    });
    current.commands.setTextSelection(positionOf(current, 'ab', 1));
    press('Enter');
    const cell = current.state.doc.firstChild?.firstChild?.firstChild;
    expect(cell?.children.map((child) => child.textContent)).toEqual(['a', 'b']);
  });

  it('leaves Tab in the cell of a table in a list item to the table, not to the list', () => {
    const current = open({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            paragraph('Item'),
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    { type: 'tableCell', content: [paragraph('one')] },
                    { type: 'tableCell', content: [paragraph('two')] },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'listItem', content: [paragraph('Other')] },
      ],
    });
    current.commands.setTextSelection(positionOf(current, 'one'));
    press('Tab');
    expect(notices).toEqual([]);
    expect(current.state.selection.$from.parent.textContent).toBe('two');
  });
});
