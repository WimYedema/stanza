import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { blockStarts, diffBlocks } from './change-marks.js';
import { schemaExtensions } from './schema.js';

const schema = getSchema(schemaExtensions());

/** A document of paragraphs with these texts. */
const doc = (...texts: string[]) =>
  schema.nodeFromJSON({
    type: 'doc',
    content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  });

describe('diffBlocks', () => {
  it('keeps every block of an unchanged document', () => {
    expect(diffBlocks(doc('a', 'b'), doc('a', 'b'))).toEqual({ kept: [0, 1], removed: 0 });
  });

  it('finds the blocks around a change by the start and the end', () => {
    expect(diffBlocks(doc('a', 'b', 'c'), doc('a', 'B', 'c'))).toEqual({
      kept: [0, -1, 2],
      removed: 1,
    });
  });

  it('finds the shared blocks in the middle, in order', () => {
    // x is new, b and d stay, c is gone, a and e are the ends.
    expect(diffBlocks(doc('a', 'b', 'c', 'd', 'e'), doc('a', 'x', 'b', 'd', 'e'))).toEqual({
      kept: [0, -1, 1, 3, 4],
      removed: 1,
    });
  });

  it('counts a block that moved as removed and new', () => {
    const { kept, removed } = diffBlocks(doc('a', 'b', 'c'), doc('b', 'c', 'a'));
    expect(kept.filter((index) => index < 0)).toHaveLength(1);
    expect(removed).toBe(1);
  });

  it('handles a document that gets blocks or loses all of them', () => {
    expect(diffBlocks(doc('a'), doc('a', 'b', 'c'))).toEqual({ kept: [0, -1, -1], removed: 0 });
    expect(diffBlocks(doc('a', 'b'), doc('x'))).toEqual({ kept: [-1], removed: 2 });
  });

  it('tells blocks that look alike but differ in a mark, or in the style', () => {
    const plain = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
    });
    const strong = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'strong' }] }] },
      ],
    });
    const styled = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { style: 'note' }, content: [{ type: 'text', text: 'a' }] },
      ],
    });
    expect(diffBlocks(plain, strong).kept).toEqual([-1]);
    expect(diffBlocks(plain, styled).kept).toEqual([-1]);
  });

  it('counts a very large stretch of difference as all changed, without comparing it', () => {
    const many = (prefix: string) =>
      Array.from({ length: 2100 }, (_, index) => `${prefix}${String(index)}`);
    const { kept, removed } = diffBlocks(
      doc('start', ...many('a'), 'end'),
      doc('start', ...many('b'), 'end'),
    );
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(2101);
    expect(kept.slice(1, -1).every((index) => index === -1)).toBe(true);
    expect(removed).toBe(2100);
  });
});

describe('blockStarts', () => {
  it('gives the position where each top-level block starts', () => {
    // A paragraph with text "ab" takes 4 positions: its two edges and two characters.
    expect(blockStarts(doc('ab', 'c', 'def'))).toEqual([0, 4, 7]);
  });
});
