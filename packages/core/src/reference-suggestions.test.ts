import { describe, expect, it } from 'vitest';
import type { Block, Document } from './document.js';
import { isNodeId, type NodeId } from './ids.js';
import { suggestReferences } from './reference-suggestions.js';

function id(value: string): NodeId {
  if (!isNodeId(value)) throw new Error(`invalid test ID ${value}`);
  return value;
}

const heading = (identifier: string | undefined, text: string, level: 1 | 2 | 3 = 2): Block => ({
  type: 'heading',
  level,
  ...(identifier !== undefined ? { id: id(identifier) } : {}),
  content: [{ type: 'text', text, marks: [] }],
});

const document: Document = {
  meta: { fields: {} },
  blocks: [
    heading('aaaaaaaaaa', 'Threat Model', 1),
    heading('bbbbbbbbbb', 'S1 \u2014 Unauthorised sign-in through a stolen password'),
    heading('cccccccccc', 'I5 \u2014 Secrets exposed in documents, source or configuration'),
    heading('dddddddddd', 'T6 \u2014 Unauthorised pipeline changes after I5 leaks'),
    { type: 'paragraph', content: [{ type: 'text', text: 'I5 is a paragraph', marks: [] }] },
    heading('eeeeeeeeee', 'Observations from the code review'),
    heading('ffffffffff', 'I50 \u2014 Another one'),
    heading(undefined, 'A heading without an ID'),
  ],
};

const ids = (query: string): string[] => suggestReferences(document, query).map((s) => s.id);
const ORDER = ['title', 'prefix', 'contains', 'words'];
const order = (a: string | undefined, b: string | undefined): number =>
  ORDER.indexOf(a ?? '') - ORDER.indexOf(b ?? '');

describe('suggestReferences', () => {
  it('gives the headings that have an ID, in order, when nothing is looked for', () => {
    expect(ids('')).toEqual([
      'aaaaaaaaaa',
      'bbbbbbbbbb',
      'cccccccccc',
      'dddddddddd',
      'eeeeeeeeee',
      'ffffffffff',
    ]);
    expect(ids('   ')).toHaveLength(6);
  });

  it('puts a heading that starts with the text first, then the ones that only mention it', () => {
    const found = suggestReferences(document, 'I5');
    expect(found.map((s) => [s.id, s.match])).toEqual([
      ['cccccccccc', 'prefix'],
      ['dddddddddd', 'contains'],
      ['ffffffffff', 'contains'],
    ]);
  });

  it('goes by the text of a heading alone, and knows no codes', () => {
    const plain: Document = {
      meta: { fields: {} },
      blocks: [heading('gggggggggg', 'Chapter 7'), heading('hhhhhhhhhh', 'Chapter 70')],
    };
    expect(suggestReferences(plain, 'chapter 7').map((s) => [s.id, s.match])).toEqual([
      ['gggggggggg', 'title'],
      ['hhhhhhhhhh', 'contains'],
    ]);
    expect(suggestReferences(plain, '7').map((s) => s.id)).toEqual(['gggggggggg', 'hhhhhhhhhh']);
  });

  it('matches whatever the case and the punctuation around the selection', () => {
    expect(ids('i5')[0]).toBe('cccccccccc');
    expect(ids('(I5),')[0]).toBe('cccccccccc');
  });

  it('matches a whole title before one that only starts with it', () => {
    expect(suggestReferences(document, 'Observations from the code review')[0]?.match).toBe(
      'title',
    );
    expect(suggestReferences(document, 'Unauthorised')[0]?.match).toBe('contains');
    expect(suggestReferences(document, 'Observations')[0]?.match).toBe('prefix');
  });

  it('matches the words of a selection in any order, and the weakest last', () => {
    expect(suggestReferences(document, 'review code').map((s) => s.match)).toEqual(['words']);
    const kinds = suggestReferences(document, 'in').map((s) => s.match);
    expect(kinds).toEqual([...kinds].sort(order));
  });

  it('keeps document order within one kind of match', () => {
    expect(ids('unauthorised')).toEqual(['bbbbbbbbbb', 'dddddddddd']);
  });

  it('gives all the headings, without a match, when none matches', () => {
    const found = suggestReferences(document, 'nothing like this');
    expect(found).toHaveLength(6);
    expect(found.every((s) => s.match === undefined)).toBe(true);
  });
});
