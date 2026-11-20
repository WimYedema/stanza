import { describe, expect, it } from 'vitest';
import { parseStylesheet } from '@stanza/format';
import { listHeadings, nestHeadings } from './headings.js';

const FRONT = '---\nstanza-format: 1\ntitle: "T"\n---\n\n';
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

describe('listHeadings', () => {
  const text = `${FRONT}# One\n\nText with **strong** words.\n\n## Two\n\n- an item\n\n# *Three* done\n`;

  it('gives the number of the block, the level, the number and the plain title of each heading', () => {
    expect(listHeadings(text, stylesheet)).toEqual([
      { block: 0, level: 1, number: '1', title: 'One' },
      { block: 2, level: 2, number: '1.1', title: 'Two' },
      { block: 4, level: 1, number: '2', title: 'Three done' },
    ]);
  });

  it('has no numbers without a stylesheet', () => {
    expect(listHeadings(text, undefined).map((heading) => heading.number)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('has no headings for a document without any', () => {
    expect(listHeadings(`${FRONT}Only text.\n`, stylesheet)).toEqual([]);
  });
});

describe('nestHeadings', () => {
  const item = (block: number, level: number, title: string) => ({
    block,
    level,
    number: undefined,
    title,
  });

  it('puts each heading under the nearest one before it with a lower level', () => {
    const nested = nestHeadings([
      item(0, 1, 'A'),
      item(2, 2, 'A.1'),
      item(4, 3, 'A.1.1'),
      item(6, 2, 'A.2'),
      item(8, 1, 'B'),
    ]);
    expect(nested.map((node) => node.title)).toEqual(['A', 'B']);
    expect(nested[0]?.children.map((node) => node.title)).toEqual(['A.1', 'A.2']);
    expect(nested[0]?.children[0]?.children.map((node) => node.title)).toEqual(['A.1.1']);
    expect(nested[1]?.children).toEqual([]);
  });

  it('nests under a level that skipped one, and starts at a deeper level', () => {
    const nested = nestHeadings([
      item(0, 2, 'Deep start'),
      item(1, 4, 'Skipped'),
      item(2, 2, 'Again'),
    ]);
    expect(nested.map((node) => node.title)).toEqual(['Deep start', 'Again']);
    expect(nested[0]?.children.map((node) => node.title)).toEqual(['Skipped']);
  });

  it('keeps the block, level and number of each heading', () => {
    const [node] = nestHeadings([{ block: 4, level: 1, number: '2', title: 'T' }]);
    expect(node).toEqual({ block: 4, level: 1, number: '2', title: 'T', children: [] });
  });

  it('gives nothing for no headings', () => {
    expect(nestHeadings([])).toEqual([]);
  });
});
