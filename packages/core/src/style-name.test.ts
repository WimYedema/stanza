import { describe, expect, it } from 'vitest';
import { isStyleName } from './style-name.js';

describe('isStyleName', () => {
  it.each(['body', 'cover-title', 'table-grid', 'h1', 'a-b-c'])('accepts %s', (value) => {
    expect(isStyleName(value)).toBe(true);
  });

  it.each(['', 'Body', '1body', 'cover_title', '-body', 'body-', 'cover--title', 'cover title'])(
    'rejects "%s"',
    (value) => {
      expect(isStyleName(value)).toBe(false);
    },
  );
});
