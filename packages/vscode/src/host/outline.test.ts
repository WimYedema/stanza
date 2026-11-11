import { describe, expect, it } from 'vitest';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { outlineOf } from './outline.js';

const FRONT = (title?: string): string =>
  `---\nphrase-format: 1\n${title === undefined ? '' : `title: "${title}"\n`}---\n\n`;
const RESERVED = [
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'code',
  'list-bulleted',
  'list-numbered',
]
  .map((name) => `  ${name}: {}\n`)
  .join('');
const stylesheet = parseStylesheet(
  `phrase-format: 1\nparagraph-styles:\n  body: {}\n  heading-1:\n    numbered: true\n  heading-2:\n    based-on: heading-1\n${RESERVED}table-styles:\n  table: {}\n`,
).stylesheet;

const loaded = (path: string, text: string) => ({ path, document: parseDocument(text).document });

describe('outlineOf', () => {
  it('gives the documents by path, with their headings nested and numbered', () => {
    const outline = outlineOf({
      stylesheet,
      documents: [
        loaded('documents/b.phrase.md', `${FRONT('Second')}# Only\n`),
        loaded('documents/a.phrase.md', `${FRONT('First')}# One\n\nText.\n\n## Sub\n\n# Two\n`),
      ],
    });
    expect(outline.map((entry) => [entry.path, entry.title])).toEqual([
      ['documents/a.phrase.md', 'First'],
      ['documents/b.phrase.md', 'Second'],
    ]);
    const [first] = outline;
    expect(first?.headings.map((heading) => [heading.number, heading.title])).toEqual([
      ['1', 'One'],
      ['2', 'Two'],
    ]);
    expect(first?.headings[0]?.children.map((heading) => [heading.number, heading.title])).toEqual([
      ['1.1', 'Sub'],
    ]);
  });

  it('takes the name of the file for a document without a title', () => {
    const [entry] = outlineOf({
      stylesheet,
      documents: [loaded('documents/meeting-notes.phrase.md', `${FRONT()}# Hi\n`)],
    });
    expect(entry?.title).toBe('meeting-notes');
  });

  it('has no numbers without a stylesheet, and no headings for a document without any', () => {
    const outline = outlineOf({
      stylesheet: undefined,
      documents: [
        loaded('documents/a.phrase.md', `${FRONT('A')}# One\n`),
        loaded('documents/b.phrase.md', `${FRONT('B')}Text only.\n`),
      ],
    });
    expect(outline[0]?.headings[0]?.number).toBeUndefined();
    expect(outline[1]?.headings).toEqual([]);
  });

  it('is empty for a project that has no documents', () => {
    expect(outlineOf({ stylesheet, documents: [] })).toEqual([]);
  });
});
