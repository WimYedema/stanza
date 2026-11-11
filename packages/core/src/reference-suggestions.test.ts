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
    heading(undefined, 'A heading without an ID'),
  ],
};

const ids = (query: string): string[] => suggestReferences(document, query).map((s) => s.id);

describe('suggestReferences', () => {
  it('gives the headings that have an ID, in order, when nothing is looked for', () => {
    expect(ids('')).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd', 'eeeeeeeeee']);
    expect(ids('   ')).toHaveLength(5);
  });

  it('puts the heading with the code first, then the ones that only mention it', () => {
    const found = suggestReferences(document, 'I5');
    expect(found.map((s) => [s.id, s.match])).toEqual([
      ['cccccccccc', 'code'],
      ['dddddddddd', 'contains'],
    ]);
  });

  it('matches the code whatever the case and the punctuation around the selection', () => {
    expect(ids('t6')[0]).toBe('dddddddddd');
    expect(ids('(T6),')[0]).toBe('dddddddddd');
  });

  it('matches a title as a whole, with or without the code, before one that starts with it', () => {
    expect(suggestReferences(document, 'Observations from the code review')[0]?.match).toBe(
      'title',
    );
    const bare = suggestReferences(document, 'unauthorised sign-in through a stolen password');
    expect(bare.map((s) => [s.id, s.match])).toEqual([['bbbbbbbbbb', 'title']]);
    expect(suggestReferences(document, 'Unauthorised')[0]?.match).toBe('prefix');
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
    expect(found).toHaveLength(5);
    expect(found.every((s) => s.match === undefined)).toBe(true);
  });

  it('says what a reference to a heading reads when no text was selected', () => {
    const labels = suggestReferences(document, '').map((s) => s.label);
    expect(labels).toEqual(['Threat Model', 'S1', 'I5', 'T6', 'Observations from the code review']);
  });

  it('is not led astray by a first word that has no digit, or a heading that is only a code', () => {
    const odd: Document = {
      meta: { fields: {} },
      blocks: [heading('ffffffffff', 'T6'), heading('gggggggggg', 'Version 2 notes')],
    };
    expect(suggestReferences(odd, '').map((s) => s.label)).toEqual(['T6', 'Version 2 notes']);
    expect(suggestReferences(odd, 'T6')[0]?.match).toBe('title');
  });
});

const KINDS = ['code', 'title', 'prefix', 'contains', 'words'];
function order(a: string | undefined, b: string | undefined): number {
  return KINDS.indexOf(a ?? '') - KINDS.indexOf(b ?? '');
}
