import { describe, expect, it } from 'vitest';
import { isNodeId } from './ids.js';

describe('isNodeId', () => {
  it('accepts ten lowercase Crockford base32 characters', () => {
    expect(isNodeId('k7m2q9x4zb')).toBe(true);
    expect(isNodeId('0123456789')).toBe(true);
  });

  it.each([
    ['too short', 'k7m2q9x4z'],
    ['too long', 'k7m2q9x4zb0'],
    ['uppercase', 'K7M2Q9X4ZB'],
    ['excluded letter i', 'k7m2q9x4zi'],
    ['excluded letter l', 'k7m2q9x4zl'],
    ['excluded letter o', 'k7m2q9x4zo'],
    ['excluded letter u', 'k7m2q9x4zu'],
    ['hyphen', 'k7m2q-x4zb'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isNodeId(value)).toBe(false);
  });
});
