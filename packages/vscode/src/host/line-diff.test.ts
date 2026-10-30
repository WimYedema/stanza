import { describe, expect, it } from 'vitest';
import { applyLineEdit, lineEdit } from './line-diff.js';

function check(before: string, after: string): void {
  const edit = lineEdit(before, after);
  if (edit === undefined) expect(before).toBe(after);
  else expect(applyLineEdit(before, edit)).toBe(after);
}

describe('lineEdit', () => {
  it('is nothing for the same text', () => {
    expect(lineEdit('a\nb\n', 'a\nb\n')).toBeUndefined();
  });

  it('is one range from the first to the last line that differs', () => {
    expect(lineEdit('a\nb\nc\nd\n', 'a\nB\nC\nd\n')).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 3, character: 0 },
      text: 'B\nC\n',
    });
  });

  it('inserts lines in the middle and at the end', () => {
    expect(lineEdit('a\nc\n', 'a\nb\nc\n')).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 0 },
      text: 'b\n',
    });
    expect(lineEdit('a\n', 'a\nb\n')).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 0 },
      text: 'b\n',
    });
  });

  it('deletes lines, and a whole text', () => {
    expect(lineEdit('a\nb\nc\n', 'a\nc\n')).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 2, character: 0 },
      text: '',
    });
    check('a\nb\n', '');
    check('', 'a\nb\n');
  });

  it('changes the last line, with and without a final newline', () => {
    check('a\nb', 'a\nbb');
    check('a\nb\n', 'a\nbb\n');
    check('a\nb', 'a\nb\n');
    check('a\nb\n', 'a\nb');
  });

  it('keeps the lines that repeat inside the change', () => {
    check('a\nx\nx\nx\nb\n', 'a\nx\nb\n');
    check('x\nx\n', 'x\nx\nx\n');
    check('x\nx\nx\n', 'x\nx\n');
  });

  it('turns any text into any other', () => {
    const texts = [
      '',
      'a',
      'a\n',
      'a\nb',
      'a\nb\n',
      '\n',
      '\n\n',
      'b\na\n',
      'a\n\nb\n',
      'x\na\ny\n',
    ];
    for (const before of texts) for (const after of texts) check(before, after);
  });
});
