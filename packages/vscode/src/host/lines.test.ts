import { describe, expect, it } from 'vitest';
import { blockAt, lineOf } from './lines.js';

describe('lineOf', () => {
  it.each([
    ['42', 42],
    ['  7 ', 7],
    ['L42', 42],
    ['#L120', 120],
    ['documents/threat-model.phrase.md#L88', 88],
    ['documents/a.phrase.md:5', 5],
  ])('takes the line from %j', (input, line) => {
    expect(lineOf(input)).toBe(line);
  });

  it.each(['', 'abc', '0', 'L0', '4.2 x', '12 abc'])('takes no line from %j', (input) => {
    expect(lineOf(input)).toBeUndefined();
  });
});

describe('blockAt', () => {
  const starts = [6, 8, 12, 20];

  it('is the last block that starts on or before the line', () => {
    expect(blockAt(starts, 8)).toBe(1);
    expect(blockAt(starts, 11)).toBe(1);
    expect(blockAt(starts, 12)).toBe(2);
    expect(blockAt(starts, 500)).toBe(3);
  });

  it('is the first block for a line in the front matter, before every block', () => {
    expect(blockAt(starts, 1)).toBe(0);
    expect(blockAt(starts, 5)).toBe(0);
  });

  it('is nothing for a document without blocks', () => {
    expect(blockAt([], 3)).toBeUndefined();
  });
});
