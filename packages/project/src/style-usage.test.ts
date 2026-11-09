import { describe, expect, it } from 'vitest';
import type { Block, Document, Text } from '@phrase/core';
import { parseStylesheet } from '@phrase/format';
import type { LoadedDocument } from './load.js';
import { styleUsage } from './style-usage.js';

const stylesheet = parseStylesheet(`phrase-format: 1
paragraph-styles:
  body: {}
  heading-1: { based-on: body }
  heading-2: { based-on: body }
  heading-3: { based-on: body }
  heading-4: { based-on: body }
  heading-5: { based-on: body }
  heading-6: { based-on: body }
  code: { based-on: body }
  list-bulleted: { based-on: body }
  list-numbered: { based-on: body }
  toc-1: { based-on: body }
  toc-2: { based-on: body }
  note: { based-on: body }
  warning-note: { based-on: note }
  table-text: { based-on: body }
character-styles:
  status: { bold: true }
  status-high: { based-on: status }
table-styles:
  table: {}
  table-grid: { based-on: table, cell-style: table-text }
`).stylesheet;

const text = (value: string, marks: Text['marks'] = []): Text => ({
  type: 'text',
  text: value,
  marks,
});
const paragraph = (value: string, extra: object = {}): Block =>
  ({ type: 'paragraph', content: [text(value)], ...extra }) as Block;

const doc = (path: string, ...blocks: Block[]): LoadedDocument => ({
  path,
  document: { meta: { fields: {} }, blocks } satisfies Document,
});

/** The uses of a style as `kind path` and `via`, for short assertions. */
const usesOf = (
  family: 'paragraphStyles' | 'characterStyles' | 'tableStyles',
  documents: readonly LoadedDocument[],
  name: string,
): string[] =>
  (styleUsage(documents, stylesheet)[family].get(name as never) ?? []).map(
    (use) => `${use.kind} ${use.file}:${use.path}${use.via === undefined ? '' : ` via ${use.via}`}`,
  );

describe('styleUsage', () => {
  it('lists every style of the stylesheet, with no uses for an unused one', () => {
    const usage = styleUsage([], stylesheet);
    expect([...usage.paragraphStyles.keys()]).toContain('note');
    expect(usage.paragraphStyles.get('note' as never)).toEqual([]);
    expect([...usage.characterStyles.keys()]).toEqual(['status', 'status-high']);
    expect([...usage.tableStyles.keys()]).toEqual(['table', 'table-grid']);
  });

  it('counts a block without a style as a default use of the style of its kind', () => {
    const documents = [
      doc('a.phrase.md', { type: 'heading', level: 2, content: [text('H')] }, paragraph('P'), {
        type: 'code',
        text: 'x',
      }),
    ];
    expect(usesOf('paragraphStyles', documents, 'heading-2')).toEqual([
      'default a.phrase.md:blocks[0]',
    ]);
    expect(usesOf('paragraphStyles', documents, 'code')).toEqual(['default a.phrase.md:blocks[2]']);
    expect(usesOf('paragraphStyles', documents, 'body')).toEqual([
      'inherited a.phrase.md:blocks[0] via heading-2',
      'default a.phrase.md:blocks[1]',
      'inherited a.phrase.md:blocks[2] via code',
    ]);
  });

  it('counts a style that a block names as direct, and its bases as inherited', () => {
    const documents = [doc('a.phrase.md', paragraph('P', { style: 'warning-note' }))];
    expect(usesOf('paragraphStyles', documents, 'warning-note')).toEqual([
      'direct a.phrase.md:blocks[0]',
    ]);
    expect(usesOf('paragraphStyles', documents, 'note')).toEqual([
      'inherited a.phrase.md:blocks[0] via warning-note',
    ]);
    expect(usesOf('paragraphStyles', documents, 'body')).toEqual([
      'inherited a.phrase.md:blocks[0] via warning-note',
    ]);
  });

  it('gives the style of a list to its items, and counts the list once', () => {
    const list = {
      type: 'list',
      kind: 'bulleted',
      items: [
        { blocks: [paragraph('one'), paragraph('two')] },
        { blocks: [paragraph('three', { style: 'note' })] },
      ],
    } as Block;
    const documents = [doc('a.phrase.md', list)];
    expect(usesOf('paragraphStyles', documents, 'list-bulleted')).toEqual([
      'default a.phrase.md:blocks[0]',
    ]);
    expect(usesOf('paragraphStyles', documents, 'note')).toEqual([
      'direct a.phrase.md:blocks[0].items[1].blocks[0]',
    ]);
  });

  it('counts the character styles of marks, with their bases', () => {
    const marked: Block = {
      type: 'paragraph',
      content: [text('High', [{ type: 'style', name: 'status-high' as never }])],
    };
    const documents = [doc('a.phrase.md', marked)];
    expect(usesOf('characterStyles', documents, 'status-high')).toEqual([
      'direct a.phrase.md:blocks[0]',
    ]);
    expect(usesOf('characterStyles', documents, 'status')).toEqual([
      'inherited a.phrase.md:blocks[0] via status-high',
    ]);
  });

  it('counts the table style, and gives the cells the cell style of the table', () => {
    const cell = { blocks: [paragraph('c')] } as never;
    const table = (extra: object = {}): Block =>
      ({ type: 'table', header: [cell], rows: [[cell]], ...extra }) as Block;
    const documents = [doc('a.phrase.md', table(), table({ style: 'table-grid' }))];
    expect(usesOf('tableStyles', documents, 'table')).toEqual([
      'default a.phrase.md:blocks[0]',
      'inherited a.phrase.md:blocks[1] via table-grid',
    ]);
    expect(usesOf('tableStyles', documents, 'table-grid')).toEqual([
      'direct a.phrase.md:blocks[1]',
    ]);
    expect(usesOf('paragraphStyles', documents, 'table-text')).toEqual([
      'default a.phrase.md:blocks[1]',
    ]);
  });

  it('counts a table of contents as a default use of the styles of its levels', () => {
    const toc: Block = { type: 'phrase', kind: 'toc', text: 'depth: 2' };
    const documents = [doc('a.phrase.md', toc)];
    expect(usesOf('paragraphStyles', documents, 'toc-1')).toEqual([
      'default a.phrase.md:blocks[0]',
    ]);
    expect(usesOf('paragraphStyles', documents, 'toc-2')).toEqual([
      'default a.phrase.md:blocks[0]',
    ]);
  });

  it('reads the documents in the order given, and does not count a use twice', () => {
    const documents = [doc('b.phrase.md', paragraph('x')), doc('a.phrase.md', paragraph('y'))];
    expect(usesOf('paragraphStyles', documents, 'body')).toEqual([
      'default b.phrase.md:blocks[0]',
      'default a.phrase.md:blocks[0]',
    ]);
  });

  it('leaves out a style that the stylesheet does not have', () => {
    const documents = [doc('a.phrase.md', paragraph('P', { style: 'missing' }))];
    expect(usesOf('paragraphStyles', documents, 'missing')).toEqual([]);
  });
});
