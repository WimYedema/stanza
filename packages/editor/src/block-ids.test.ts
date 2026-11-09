// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StyleName } from '@phrase/core';
import { runCommand, type EditorCommand } from './commands.js';
import { phraseExtensions } from './editor.js';
import type { Notice } from './notice.js';
import { COMMANDS_STYLESHEET } from './styles.testing.js';

const stylesheet = COMMANDS_STYLESHEET.stylesheet;

const A = 'aaaaaaaaaa';
const B = 'bbbbbbbbbb';
const C = 'cccccccccc';
const D = 'dddddddddd';
const E = 'eeeeeeeeee';

/** Gives the IDs in order, then the last one again and again. */
function sequence(...ids: string[]): () => string {
  let next = 0;
  return () => ids[Math.min(next++, ids.length - 1)] ?? '';
}

let element: HTMLElement;
let editor: Editor | undefined;
let notices: Notice[];

beforeEach(() => {
  vi.stubGlobal('ClipboardEvent', class extends Event {});
  element = document.createElement('div');
  document.body.append(element);
  notices = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  editor?.destroy();
  editor = undefined;
  element.remove();
});

function open(
  blocks: object[],
  newId: () => string,
  usedIds: ReadonlySet<string> = new Set(),
): Editor {
  editor = new Editor({
    element,
    extensions: phraseExtensions(
      () => stylesheet,
      (notice) => notices.push(notice),
      { newId, usedIds: () => usedIds },
    ),
    content: { type: 'doc', content: blocks },
  });
  return editor;
}

const run = (current: Editor, command: EditorCommand) =>
  runCommand(
    current.state,
    (tr) => {
      current.view.dispatch(tr);
    },
    command,
    stylesheet,
  );

const paragraph = (value: string, attrs: object = {}) => ({
  type: 'paragraph',
  attrs,
  content: [{ type: 'text', text: value }],
});
const heading = (value: string, attrs: object = {}) => ({
  type: 'heading',
  attrs: { level: 1, ...attrs },
  content: [{ type: 'text', text: value }],
});
const cell = (type: 'tableHeader' | 'tableCell', value: string) => ({
  type,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const table = (attrs: object = {}) => ({
  type: 'table',
  attrs,
  content: [
    { type: 'tableRow', content: [cell('tableHeader', 'H')] },
    { type: 'tableRow', content: [cell('tableCell', 'c')] },
  ],
});

const idsOf = (current: Editor): (string | null)[] =>
  current.state.doc.children.map((node: EditorNode) => {
    const id: unknown = node.attrs['id'];
    return typeof id === 'string' ? id : null;
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

describe('IDs of new blocks', () => {
  it('keeps the ID on the first part of a heading that is split, and gives the rest a new one', () => {
    const current = open([heading('Title', { id: A, style: 'note' })], sequence(B));
    current.commands.setTextSelection(3);
    expect(current.commands.splitBlock()).toBe(true);
    const [first, second] = current.state.doc.children;
    expect(first?.attrs).toMatchObject({ id: A, style: 'note', level: 1 });
    expect(second?.attrs).toMatchObject({ id: B, style: 'note', level: 1 });
  });

  it('gives a paragraph that becomes a heading an ID, and keeps one that it has', () => {
    const current = open([paragraph('One'), paragraph('Two', { id: C })], sequence(A));
    current.commands.setTextSelection(positionOf(current, 'One'));
    expect(run(current, { type: 'set-heading', level: 1 })).toEqual({ ok: true });
    current.commands.setTextSelection(positionOf(current, 'Two'));
    expect(run(current, { type: 'set-heading', level: 2 })).toEqual({ ok: true });
    expect(idsOf(current)).toEqual([A, C]);
  });

  it('gives an inserted table an ID, and no other block that it makes', () => {
    const current = open([paragraph('One')], sequence(A, B));
    current.commands.setTextSelection(positionOf(current, 'One'));
    expect(run(current, { type: 'insert-table', columns: 2, rows: 1 })).toEqual({ ok: true });
    expect(idsOf(current)).toEqual([null, A]);
    // A list in a cell is a block of the cell, and needs no ID.
    expect(run(current, { type: 'toggle-list', kind: 'bulleted' })).toEqual({ ok: true });
    expect(idsOf(current)).toEqual([null, A]);
    current.commands.setTextSelection(positionOf(current, 'One'));
    expect(run(current, { type: 'toggle-list', kind: 'bulleted' })).toEqual({ ok: true });
    expect(idsOf(current)).toEqual([null, A]);
  });

  it('gives pasted headings and tables IDs, which are not those of the HTML', () => {
    const current = open([paragraph('')], sequence(A, B, C));
    current.view.pasteHTML(
      '<h1 id="zzzzzzzzzz">Title</h1><p>Text</p><table><tbody><tr><th>H</th></tr><tr><td>c</td></tr></tbody></table>',
    );
    const kinds = current.state.doc.children.map((node) => node.type.name);
    expect(kinds).toEqual(expect.arrayContaining(['heading', 'table']));
    const ids = idsOf(current);
    const assigned = ids.filter((id) => id !== null);
    expect(assigned).toEqual([A, B]);
    expect(ids.filter((id, index) => id === null && kinds[index] !== 'paragraph')).toEqual([]);
  });

  it('never changes an ID that exists, also when blocks around it change', () => {
    const current = open([heading('Title', { id: A }), paragraph('Text')], sequence(B, C));
    current.commands.setTextSelection(positionOf(current, 'Text'));
    run(current, { type: 'set-heading', level: 2 });
    current.commands.setTextSelection(positionOf(current, 'Title', 5));
    current.commands.insertContent('s');
    expect(idsOf(current)).toEqual([A, B]);
  });

  it('leaves alone a heading or table that nothing touched, and what it was loaded with', () => {
    const current = open(
      [heading('Old'), table(), paragraph('Some text'), heading('Other')],
      sequence(A, B),
    );
    expect(idsOf(current)).toEqual([null, null, null, null]);
    current.commands.setTextSelection(positionOf(current, 'Some', 2));
    run(current, { type: 'toggle-mark', mark: 'strong' });
    expect(idsOf(current)).toEqual([null, null, null, null]);
    // Loading new content is no edit either.
    current.commands.setContent({ type: 'doc', content: [heading('New')] }, { emitUpdate: false });
    expect(idsOf(current)).toEqual([null]);
  });

  it('gives a heading that is typed in an ID, once', () => {
    const current = open([heading('Old')], sequence(A, B));
    current.commands.setTextSelection(positionOf(current, 'Old', 3));
    current.commands.insertContent('!');
    current.commands.insertContent('?');
    expect(idsOf(current)).toEqual([A]);
  });

  it('avoids the IDs of the document and of the rest of the project, and tries again', () => {
    const current = open(
      [heading('One', { id: A }), heading('Two')],
      // The first candidates are used in this document, the project, and the document again.
      sequence(A, B, C, D),
      new Set([B, C]),
    );
    current.commands.setTextSelection(positionOf(current, 'Two', 1));
    current.commands.insertContent('x');
    expect(idsOf(current)).toEqual([A, D]);
    expect(notices).toEqual([]);
  });

  it('leaves a block without an ID, and says so, when none can be found', () => {
    const current = open([heading('One', { id: A }), heading('Two')], sequence(A));
    current.commands.setTextSelection(positionOf(current, 'Two', 1));
    current.commands.insertContent('x');
    expect(idsOf(current)).toEqual([A, null]);
    expect(notices.map((notice) => notice.code)).toEqual(['id-generation-failed']);
  });

  it('does not let a heading keep an ID that another block has, whichever block was edited', () => {
    const current = open([heading('One', { id: A }), heading('Two', { id: A })], sequence(E));
    // Both are in the file as they are; the first edit of either settles it.
    expect(idsOf(current)).toEqual([A, A]);
    current.commands.setTextSelection(positionOf(current, 'Two', 1));
    current.commands.insertContent('x');
    expect(idsOf(current)).toEqual([A, E]);
  });

  it('takes a list apart in one change, and a table that is only moved is not a new one', () => {
    const list = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph('One'), table()] }],
    };
    const current = open([list], sequence(A, B));
    current.commands.setTextSelection(positionOf(current, 'One'));
    expect(run(current, { type: 'toggle-list', kind: 'bulleted' })).toEqual({ ok: true });
    expect(current.state.doc.children.map((node) => node.type.name)).toEqual([
      'paragraph',
      'table',
    ]);
    expect(idsOf(current)).toEqual([null, null]);
    expect(notices).toEqual([]);
  });

  it('only accepts an ID source that gives IDs', () => {
    const current = open([heading('One')], () => 'not an id');
    current.commands.setTextSelection(positionOf(current, 'One', 1));
    expect(() => current.commands.insertContent('x')).toThrow('The ID source gave');
  });
});

describe('the style of the cell of a table is not an ID matter', () => {
  it('has tables and headings use only IDs, never styles', () => {
    const current = open([table({ style: 'table' as StyleName })], sequence(A));
    current.commands.setTextSelection(positionOf(current, 'c'));
    current.commands.insertContent('x');
    expect(current.state.doc.firstChild?.attrs).toMatchObject({ id: A, style: 'table' });
  });
});
