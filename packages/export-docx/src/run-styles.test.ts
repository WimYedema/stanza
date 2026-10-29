import { describe, expect, it } from 'vitest';
import { splitToggles } from './run-styles.js';

describe('splitToggles', () => {
  it('keeps changes that a character style can express', () => {
    expect(splitToggles({ bold: true, color: 'FF0000' }, {})).toEqual({
      style: { bold: true, color: 'FF0000' },
      direct: {},
    });
  });

  it('writes an explicit property to switch off a toggle the paragraph style has on', () => {
    expect(splitToggles({ bold: false, italics: true }, { bold: true })).toEqual({
      style: { italics: true },
      direct: { bold: false },
    });
  });

  it('drops an off value for a toggle that is not on', () => {
    expect(splitToggles({ bold: false }, {})).toEqual({ style: {}, direct: {} });
    expect(splitToggles({ italics: false }, { italics: false })).toEqual({ style: {}, direct: {} });
  });
});
