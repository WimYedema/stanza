import { describe, expect, it } from 'vitest';
import { validateStylesheet } from './style-validation.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';
import { fixedWordStyleName, isWordBuiltInStyleName } from './word-style-names.js';

const labelled = (label: string) => ({ ...plainStyle, label });
const problems = (stylesheet: ReturnType<typeof sheet>): [string, string | undefined][] =>
  validateStylesheet(stylesheet).map((d) => [d.code, d.path]);

describe('the label of a style', () => {
  it('may be any text of a name for people, on a style of any kind', () => {
    const stylesheet = sheet({
      paragraph: { note: labelled('Side note'), 'heading-2': labelled('Subsection') },
      character: { marker: { text: {}, label: 'Status marker' } },
      table: { 'table-grid': { label: 'Grid with lines' } },
    });
    expect(problems(stylesheet)).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['padded', ' Note'],
    ['with a comma, which Word reads as a second name', 'Note, aside'],
    ['with a semicolon', 'Note; aside'],
    ['with a line break', 'Note\naside'],
    ['too long', 'x'.repeat(81)],
  ])('is refused when it is %s', (_what, label) => {
    expect(problems(sheet({ paragraph: { note: labelled(label) } }))).toEqual([
      ['invalid-label', 'paragraph-styles.note.label'],
    ]);
  });

  it('is refused when it repeats another label, ignoring case, in any kind of style', () => {
    const stylesheet = sheet({
      paragraph: { note: labelled('Side note') },
      character: { marker: { text: {}, label: 'side NOTE' } },
    });
    const [found] = validateStylesheet(stylesheet);
    expect(found).toMatchObject({
      code: 'duplicate-label',
      path: 'character-styles.marker.label',
      message: 'The label "side NOTE" is also the label of "paragraph-styles.note".',
    });
  });

  it.each(['Quote', 'quote', 'List Paragraph', 'heading 3', 'Hyperlink'])(
    'is refused as a name that Word has built in: %s',
    (label) => {
      expect(problems(sheet({ paragraph: { note: labelled(label) } }))).toEqual([
        ['builtin-label', 'paragraph-styles.note.label'],
      ]);
    },
  );

  it('is refused as a built-in name on a table style as well', () => {
    expect(problems(sheet({ table: { 'table-grid': { label: 'Table Grid' } } }))).toEqual([
      ['builtin-label', 'table-styles.table-grid.label'],
    ]);
  });

  it('may be a built-in name on a style that Word names itself, since it is only for the editor', () => {
    const stylesheet = sheet({
      paragraph: { body: labelled('Normal'), 'heading-1': labelled('Heading 1') },
    });
    expect(problems(stylesheet)).toEqual([]);
  });
});

describe('fixedWordStyleName', () => {
  it('names the styles that Word names itself', () => {
    expect(fixedWordStyleName(n('body'))).toBe('Normal');
    expect(fixedWordStyleName(n('heading-3'))).toBe('heading 3');
    expect(fixedWordStyleName(n('toc-2'))).toBe('toc 2');
    expect(fixedWordStyleName(n('note'))).toBeUndefined();
    expect(fixedWordStyleName(n('heading-7'))).toBeUndefined();
  });
});

describe('isWordBuiltInStyleName', () => {
  it('compares ignoring case', () => {
    expect(isWordBuiltInStyleName('NORMAL')).toBe(true);
    expect(isWordBuiltInStyleName('table grid')).toBe(true);
    expect(isWordBuiltInStyleName('Side note')).toBe(false);
  });
});
