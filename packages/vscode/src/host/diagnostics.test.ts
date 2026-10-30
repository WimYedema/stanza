import { describe, expect, it } from 'vitest';
import { groupByFile } from './diagnostics.js';

describe('groupByFile', () => {
  it('groups by file, makes lines zero-based and adds the path of the problem', () => {
    const grouped = groupByFile([
      { file: 'a.phrase.md', severity: 'error', code: 'x', message: 'Bad.', line: 8 },
      { file: 'b.phrase.md', severity: 'warning', code: 'y', message: 'Meh.', path: 'blocks[1]' },
      { file: 'a.phrase.md', severity: 'warning', code: 'z', message: 'Hm.', line: 1 },
    ]);
    expect([...grouped.keys()]).toEqual(['a.phrase.md', 'b.phrase.md']);
    expect(grouped.get('a.phrase.md')).toEqual([
      { file: 'a.phrase.md', line: 7, severity: 'error', code: 'x', message: 'Bad.' },
      { file: 'a.phrase.md', line: 0, severity: 'warning', code: 'z', message: 'Hm.' },
    ]);
    expect(grouped.get('b.phrase.md')).toEqual([
      {
        file: 'b.phrase.md',
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
