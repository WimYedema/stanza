import { describe, expect, it } from 'vitest';
import { isStyleName, type StyleName } from '@stanza/core';
import { wordStyleId, wordStyleName } from './style-ids.js';

function name(value: string): StyleName {
  if (!isStyleName(value)) throw new Error(value);
  return value;
}

describe('wordStyleId and wordStyleName', () => {
  it.each([
    ['body', 'Normal', 'Normal'],
    ['heading-1', 'Heading1', 'heading 1'],
    ['heading-6', 'Heading6', 'heading 6'],
    ['code', 'Code', 'Code'],
    ['cover-title', 'CoverTitle', 'Cover Title'],
    ['list-bulleted', 'ListBulleted', 'List Bulleted'],
  ])('%s becomes %s (%s)', (input, id, display) => {
    expect(wordStyleId(name(input))).toBe(id);
    expect(wordStyleName(name(input))).toBe(display);
  });
});
