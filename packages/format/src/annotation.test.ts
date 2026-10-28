import { describe, expect, it } from 'vitest';
import { readAnnotationId } from './annotation.js';

describe('readAnnotationId', () => {
  it('reads the id of an annotation', () => {
    expect(readAnnotationId('<!-- phrase: #k7m2q9x4zb -->')).toBe('k7m2q9x4zb');
  });

  it('reads the id when other tokens are present', () => {
    expect(readAnnotationId('<!-- phrase: .table-grid #n3d8w5r1ya widths="30 70" -->')).toBe(
      'n3d8w5r1ya',
    );
  });

  it('ignores indentation', () => {
    expect(readAnnotationId('   <!-- phrase: #k7m2q9x4zb -->')).toBe('k7m2q9x4zb');
  });

  it.each([
    ['no id', '<!-- phrase: .cover-title -->'],
    ['invalid id', '<!-- phrase: #NOT-AN-ID -->'],
    ['ordinary comment', '<!-- #k7m2q9x4zb -->'],
    ['not a comment', '#k7m2q9x4zb'],
  ])('returns undefined for %s', (_label, line) => {
    expect(readAnnotationId(line)).toBeUndefined();
  });
});
