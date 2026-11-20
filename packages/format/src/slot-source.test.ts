import { describe, expect, it } from 'vitest';
import { slotSource } from './slot-source.js';
import { parseStylesheet } from './stylesheet.js';

describe('slotSource', () => {
  it('writes the text of a slot as it is read, with tokens and fields as links', () => {
    for (const text of [
      'Page [1](stanza:page) of [1](stanza:pages)',
      '[](stanza:title)',
      'Draft [v?](stanza:version) by [](stanza:field:reviewers)',
      'just text',
    ]) {
      const sheet = parseStylesheet(
        `stanza-format: 1\npage-templates:\n  page:\n    header:\n      left: '${text}'\n`,
      ).stylesheet;
      const parts = sheet.pageTemplates.get('page' as never)?.header?.left ?? [];
      expect(slotSource(parts)).toBe(text);
    }
  });

  it('writes nothing for an empty slot', () => {
    expect(slotSource([])).toBe('');
  });
});
