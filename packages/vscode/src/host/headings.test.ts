import { describe, expect, it } from 'vitest';
import { parseStylesheet } from '@phrase/format';
import { listHeadings } from './headings.js';

const FRONT = '---\nphrase-format: 1\ntitle: "T"\n---\n\n';
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
