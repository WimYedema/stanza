import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { editorPosition, moveTo } from './position.js';
import { schemaExtensions } from './schema.js';

const schema = getSchema(schemaExtensions());

const text = (value: string, marks: object[] = []) => ({ type: 'text', text: value, marks });
const paragraph = (...runs: object[]) => ({ type: 'paragraph', content: runs });
const doc = (...blocks: object[]) => schema.nodeFromJSON({ type: 'doc', content: blocks });

const SAMPLE = doc(
  { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
  paragraph(text('Some '), text('bold', [{ type: 'strong' }]), text(' text')),
  { type: 'phraseBlock', attrs: { kind: 'toc', text: '' } },
  {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [paragraph(text('One'))] },
      { type: 'listItem', content: [paragraph(text('Two'))] },
    ],
  },
);

const stateAt = (pos: number, from = SAMPLE) =>
  EditorState.create({ schema, doc: from, selection: TextSelection.create(from, pos) });

/** The position in the document of the first character of a piece of text. */
function posOf(value: string, document = SAMPLE): number {
  let found = -1;
  document.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value) === true) {
      found = pos + (node.text.indexOf(value) + 0);
    }
  });
  return found;
}

describe('the position of the cursor', () => {
  it('is the block and the characters before the cursor in it', () => {
    expect(editorPosition(stateAt(posOf('Title') + 3))).toEqual({ block: 0, offset: 3 });
    // Marks do not count, only the text before the cursor.
    expect(editorPosition(stateAt(posOf('bold') + 2))).toEqual({ block: 1, offset: 7 });
    expect(editorPosition(stateAt(posOf('Two') + 1))).toEqual({ block: 3, offset: 5 });
  });

  it('puts the cursor back in the same place when the content is replaced', () => {
    for (const value of ['Title', 'bold', 'Two']) {
      const state = stateAt(posOf(value) + 1);
      const position = editorPosition(state);
      const next = EditorState.create({ schema, doc: SAMPLE });
      const moved = next.apply(moveTo(next, position));
      expect(editorPosition(moved)).toEqual(position);
      expect(moved.selection.head).toBe(state.selection.head);
    }
  });

  it('stays near the place when the block is shorter or gone', () => {
    const short = doc(paragraph(text('Hi')));
    const state = EditorState.create({ schema, doc: short });
    const inRange = state.apply(moveTo(state, { block: 0, offset: 99 }));
    expect(inRange.selection.head).toBe(3);
    const beyond = state.apply(moveTo(state, { block: 5, offset: 0 }));
    expect(editorPosition(beyond).block).toBe(0);
  });

  it('copes with a block that is only an atom, and with an empty document', () => {
    const atom = EditorState.create({ schema, doc: SAMPLE });
    const moved = atom.apply(moveTo(atom, { block: 2, offset: 0 }));
    expect(moved.selection.$head.parent.type.name).not.toBe('phraseBlock');
    const empty = EditorState.create({ schema, doc: doc() });
    expect(moveTo(empty, { block: 0, offset: 0 }).docChanged).toBe(false);
  });
});
