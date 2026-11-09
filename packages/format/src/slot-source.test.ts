import { describe, expect, it } from 'vitest';
import { slotSource } from './slot-source.js';
import { parseStylesheet } from './stylesheet.js';

describe('slotSource', () => {
  it('writes the text of a slot as it is read, with tokens and fields as links', () => {
    for (const text of [
      'Page [1](phrase:page) of [1](phrase:pages)',
      '[](phrase:title)',
      'Draft [v?](phrase:version) by [](phrase:field:reviewers)',
      'just text',
    ]) {
      const sheet = parseStylesheet(
        `phrase-format: 1\npage-templates:\n  page:\n    header:\n      left: '${text}'\n`,
      ).stylesheet;
      const parts = sheet.pageTemplates.get('page' as never)?.header?.left ?? [];
      expect(slotSource(parts)).toBe(text);
    }
  });

  it('writes nothing for an empty slot', () => {
    expect(slotSource([])).toBe('');
  });
});
