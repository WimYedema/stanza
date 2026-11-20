import { describe, expect, it } from 'vitest';
import { groupByFile } from './diagnostics.js';

describe('groupByFile', () => {
  it('groups by file, makes lines zero-based and adds the path of the problem', () => {
    const grouped = groupByFile([
      { file: 'a.stanza.md', severity: 'error', code: 'x', message: 'Bad.', line: 8 },
      { file: 'b.stanza.md', severity: 'warning', code: 'y', message: 'Meh.', path: 'blocks[1]' },
      { file: 'a.stanza.md', severity: 'warning', code: 'z', message: 'Hm.', line: 1 },
    ]);
    expect([...grouped.keys()]).toEqual(['a.stanza.md', 'b.stanza.md']);
    expect(grouped.get('a.stanza.md')).toEqual([
      { file: 'a.stanza.md', line: 7, severity: 'error', code: 'x', message: 'Bad.' },
      { file: 'a.stanza.md', line: 0, severity: 'warning', code: 'z', message: 'Hm.' },
    ]);
    expect(grouped.get('b.stanza.md')).toEqual([
      {
        file: 'b.stanza.md',
        line: undefined,
        severity: 'warning',
        code: 'y',
        message: 'Meh. [blocks[1]]',
      },
    ]);
  });

  it('is empty for no diagnostics', () => {
    expect(groupByFile([]).size).toBe(0);
  });
});
