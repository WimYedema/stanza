import { describe, expect, it } from 'vitest';
import { PARAGRAPH_PROPERTIES } from '@phrase/core';
import type { Family } from './styles-families.js';
import { paragraphGroups } from './styles-groups.js';

const FAMILIES: readonly Family[] = ['paragraphs', 'headings', 'lists'];
const titles = (family: Family): string[] => paragraphGroups(family).map((group) => group.title);

describe('paragraphGroups', () => {
  it.each(FAMILIES)('has every paragraph property once for %s', (family) => {
    const keys = paragraphGroups(family).flatMap((group) => group.keys);
    expect([...keys].sort()).toEqual(PARAGRAPH_PROPERTIES.map((property) => property.key).sort());
  });

  it('puts the numbering of headings under a hint that says how it is made', () => {
    const numbering = paragraphGroups('headings').find((group) => group.title === 'Numbering');
    expect(numbering?.keys).toEqual(['numbered']);
    expect(numbering?.hint).toContain('1.1');
  });

  it('puts the indents of a list first, with a hint about nested levels', () => {
    const [first] = paragraphGroups('lists');
    expect(first?.title).toBe('List indents');
    expect(first?.keys).toEqual(['indent-left', 'first-line-indent']);
    expect(first?.hint).toContain('(n + 1)');
  });

  it('keeps the indents with the spacing of other styles', () => {
    expect(titles('paragraphs')).toEqual(['Spacing and alignment', 'Flow', 'Numbering']);
    expect(paragraphGroups('paragraphs')[0]?.keys).toContain('indent-left');
  });
});
