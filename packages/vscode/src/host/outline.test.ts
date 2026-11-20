import { describe, expect, it } from 'vitest';
import { parseDocument, parseStylesheet } from '@stanza/format';
import type { OutlineEntry } from '@stanza/core';
import { outlineOf, type OutlineDocument, type OutlineItem } from './outline.js';

const FRONT = (title?: string): string =>
  `---\nstanza-format: 1\n${title === undefined ? '' : `title: "${title}"\n`}---\n\n`;
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
  `stanza-format: 1\nparagraph-styles:\n  body: {}\n  heading-1:\n    numbered: true\n  heading-2:\n    based-on: heading-1\n${RESERVED}table-styles:\n  table: {}\n`,
).stylesheet;

const loaded = (path: string, text: string, listed = true) => ({
  path,
  document: parseDocument(text).document,
  listed,
});
const doc = (path: string): OutlineEntry => ({ kind: 'document', path });

/** The documents in the outline in the order given, as a project without a list has them. */
const flat = (...documents: { path: string }[]): OutlineEntry[] =>
  documents.map(({ path }) => doc(path));

/** The kind of each item and its path or title, down through the groups. */
const shape = (items: readonly OutlineItem[]): unknown[] =>
  items.map((item) =>
    item.kind === 'group' ? [item.title, shape(item.items)] : [item.path, item.listed],
  );

describe('outlineOf', () => {
  it('gives the documents in the order of the outline, with their headings nested and numbered', () => {
    const documents = [
      loaded('documents/a.stanza.md', `${FRONT('First')}# One\n\nText.\n\n## Sub\n\n# Two\n`),
      loaded('documents/b.stanza.md', `${FRONT('Second')}# Only\n`),
    ];
    const outline = outlineOf({ stylesheet, documents, outline: flat(...documents) }).filter(
      (item): item is OutlineDocument => item.kind === 'document',
    );
    expect(outline.map((entry) => [entry.path, entry.title])).toEqual([
      ['documents/a.stanza.md', 'First'],
      ['documents/b.stanza.md', 'Second'],
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

  it('follows the order of the outline and keeps its groups', () => {
    const documents = [
      loaded('b.stanza.md', `${FRONT('B')}# B\n`),
      loaded('a.stanza.md', `${FRONT('A')}# A\n`),
      loaded('c.stanza.md', `${FRONT('C')}# C\n`),
    ];
    const outline = outlineOf({
      stylesheet,
      documents,
      outline: [
        { kind: 'group', title: 'Part', items: [doc('c.stanza.md'), doc('a.stanza.md')] },
        doc('b.stanza.md'),
      ],
    });
    expect(shape(outline)).toEqual([
      [
        'Part',
        [
          ['c.stanza.md', true],
          ['a.stanza.md', true],
        ],
      ],
      ['b.stanza.md', true],
    ]);
  });

  it('puts the documents that the list leaves out last, by path, and says so', () => {
    const documents = [
      loaded('b.stanza.md', `${FRONT('B')}# B\n`),
      loaded('z.stanza.md', `${FRONT('Z')}# Z\n`, false),
      loaded('m.stanza.md', `${FRONT('M')}# M\n`, false),
    ];
    expect(shape(outlineOf({ stylesheet, documents, outline: [doc('b.stanza.md')] }))).toEqual([
      ['b.stanza.md', true],
      ['m.stanza.md', false],
      ['z.stanza.md', false],
    ]);
  });

  it('leaves out a listed document that does not exist, and keeps its group', () => {
    const documents = [loaded('a.stanza.md', `${FRONT('A')}# A\n`)];
    const outline = outlineOf({
      stylesheet,
      documents,
      outline: [{ kind: 'group', title: 'G', items: [doc('gone.stanza.md')] }, doc('a.stanza.md')],
    });
    expect(shape(outline)).toEqual([
      ['G', []],
      ['a.stanza.md', true],
    ]);
  });

  it('takes the name of the file for a document without a title', () => {
    const documents = [loaded('documents/meeting-notes.stanza.md', `${FRONT()}# Hi\n`)];
    const [entry] = outlineOf({ stylesheet, documents, outline: flat(...documents) });
    expect(entry?.kind === 'document' ? entry.title : undefined).toBe('meeting-notes');
  });

  it('has no numbers without a stylesheet, and no headings for a document without any', () => {
    const documents = [
      loaded('documents/a.stanza.md', `${FRONT('A')}# One\n`),
      loaded('documents/b.stanza.md', `${FRONT('B')}Text only.\n`),
    ];
    const [a, b] = outlineOf({ stylesheet: undefined, documents, outline: flat(...documents) });
    expect(a?.kind === 'document' ? a.headings[0]?.number : 'x').toBeUndefined();
    expect(b?.kind === 'document' ? b.headings : 'x').toEqual([]);
  });

  it('is empty for a project that has no documents', () => {
    expect(outlineOf({ stylesheet, documents: [], outline: [] })).toEqual([]);
  });
});
