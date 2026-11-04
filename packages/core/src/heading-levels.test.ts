import { describe, expect, it } from 'vitest';
import { maxHeadingLevel } from './heading-levels.js';

describe('maxHeadingLevel', () => {
  it('is 1 for the first heading, and one deeper than the heading before otherwise', () => {
    expect(maxHeadingLevel(undefined)).toBe(1);
    expect(maxHeadingLevel(1)).toBe(2);
    expect(maxHeadingLevel(4)).toBe(5);
  });

  it('stops at level 6', () => {
    expect(maxHeadingLevel(5)).toBe(6);
    expect(maxHeadingLevel(6)).toBe(6);
  });
});
