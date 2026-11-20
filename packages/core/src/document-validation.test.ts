import { describe, expect, it } from 'vitest';
import { validateDocument } from './document-validation.js';
import type { Block, Document, Heading, Inline, List, Mark, Paragraph, Table } from './document.js';
import { isNodeId, type NodeId } from './ids.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';
import { plainCell } from './table-cell.js';

const strong: Mark = { type: 'strong' };
const emphasis: Mark = { type: 'emphasis' };
const code: Mark = { type: 'code' };

function id(value: string): NodeId {
  if (!isNodeId(value)) throw new Error(`invalid test ID ${value}`);
  return value;
}

const A = id('aaaaaaaaaa');
const B = id('bbbbbbbbbb');

function run(text: string, ...marks: Mark[]): Inline {
  return { type: 'text', text, marks };
}

const heading = (content: Inline[], extra: Partial<Heading> = {}): Heading => ({
  type: 'heading',
  level: 1,
  id: A,
  content,
  ...extra,
});
const paragraph = (content: Inline[], extra: Partial<Paragraph> = {}): Paragraph => ({
  type: 'paragraph',
  content,
  ...extra,
});
const table = (extra: Partial<Table> = {}): Table => ({
  type: 'table',
  id: B,
  header: [plainCell([run('H')])],
  rows: [[plainCell([run('c')])]],
  ...extra,
});
const documentOf = (...blocks: Block[]): Document => ({ meta: { fields: {} }, blocks });

/** Body allows strong and emphasis, headings only emphasis, and list items allow neither. */
const stylesheet = sheet({
  paragraph: {
    body: { ...plainStyle, variants: { strong: {}, emphasis: {}, code: {} } },
    'heading-1': { ...plainStyle, basedOn: n('body'), variants: { strong: null } },
    'list-bulleted': { ...plainStyle, variants: { emphasis: {} } },
    'list-numbered': { ...plainStyle },
    note: { ...plainStyle, variants: { code: {} } },
  },
  character: { marker: { text: { bold: true } } },
  table: { 'table-grid': {} },
});

const problems = (document: Document) =>
  validateDocument(document, stylesheet).map((d) => [d.code, d.path]);

describe('validateDocument', () => {
  it('accepts a valid document', () => {
    const list: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph([run('item', emphasis)]), table({ id: id('cccccccccc') })] }],
    };
    expect(
      validateDocument(
        documentOf(
          heading([run('Title', emphasis)]),
          paragraph([run('Some '), run('strong', strong), run(' and '), run('x', code)]),
          list,
          table({ style: n('table-grid'), id: id('dddddddddd') }),
        ),
        stylesheet,
      ),
    ).toEqual([]);
  });

  it('reports a mark the style does not offer, once per mark and block', () => {
    expect(
      problems(documentOf(heading([run('a', strong), run('b', strong), run('c', emphasis)]))),
    ).toEqual([['mark-not-allowed', 'blocks[0].content']]);
  });

  it('names the mark and the style', () => {
    const [diagnostic] = validateDocument(documentOf(heading([run('a', strong)])), stylesheet);
    expect(diagnostic).toEqual(
      expect.objectContaining({
        severity: 'error',
        message: '"strong" is not offered by the style "heading-1".',
      }),
    );
  });

  it('offers to declare the variant, which only the person editing decides', () => {
    const [diagnostic] = validateDocument(documentOf(heading([run('a', strong)])), stylesheet);
    expect(diagnostic?.fix).toEqual({
      kind: 'declare-variant',
      style: n('heading-1'),
      mark: 'strong',
    });
  });

  it('uses the style of the block, then of the list, then the default', () => {
    expect(
      problems(
        documentOf(
          paragraph([run('a', strong)], { style: n('note') }),
          paragraph([run('a', code)], { style: n('note') }),
        ),
      ),
    ).toEqual([['mark-not-allowed', 'blocks[0].content']]);

    const bulleted: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph([run('a', emphasis)]), paragraph([run('b', strong)])] }],
    };
    const numbered: List = {
      type: 'list',
      kind: 'numbered',
      items: [{ blocks: [paragraph([run('a', emphasis)])] }],
    };
    const custom: List = {
      type: 'list',
      kind: 'numbered',
      style: n('note'),
      items: [{ blocks: [paragraph([run('a', code)])] }],
    };
    expect(problems(documentOf(bulleted, numbered, custom))).toEqual([
      ['mark-not-allowed', 'blocks[0].items[0].blocks[1].content'],
      ['mark-not-allowed', 'blocks[1].items[0].blocks[0].content'],
    ]);
  });

  it('checks table cells against the body style', () => {
    const cellWith = (mark: Mark): Table =>
      table({ header: [plainCell([run('H', mark)])], rows: [[plainCell([run('c', mark)])]] });
    expect(problems(documentOf(cellWith(strong)))).toEqual([]);
    expect(problems(documentOf(cellWith({ type: 'link', href: 'https://example.com' })))).toEqual([
      ['mark-not-allowed', 'blocks[0].header[0].blocks[0].content'],
      ['mark-not-allowed', 'blocks[0].rows[0][0].blocks[0].content'],
    ]);
  });

  it('checks table cells against the cell style of the table style', () => {
    const withCellStyle = sheet({
      paragraph: { 'table-cell': plainStyle },
      table: { table: { cellStyle: n('table-cell') } },
    });
    const cell = table({ header: [plainCell([run('H', strong)])], rows: [] });
    expect(validateDocument(documentOf(cell), withCellStyle).map((d) => [d.code, d.path])).toEqual([
      ['mark-not-allowed', 'blocks[0].header[0].blocks[0].content'],
    ]);
  });

  it('reports unknown styles and character styles', () => {
    const unknownMarker: Mark = { type: 'style', name: n('nope') };
    expect(
      problems(
        documentOf(
          paragraph([run('a')], { style: n('missing') }),
          heading([run('a', unknownMarker)]),
          table({ style: n('table-missing') }),
          { type: 'list', kind: 'bulleted', style: n('missing'), items: [] },
        ),
      ),
    ).toEqual([
      ['unknown-style', 'blocks[0]'],
      ['unknown-style', 'blocks[1].content'],
      ['unknown-style', 'blocks[2]'],
      ['unknown-style', 'blocks[3]'],
    ]);
  });

  it('still checks the content of a block whose style is unknown', () => {
    expect(
      problems(documentOf(paragraph([run('a', code), run('b', strong)], { style: n('missing') }))),
    ).toEqual([['unknown-style', 'blocks[0]']]);
    expect(problems(documentOf(heading([run('a', strong)], { style: n('missing') })))).toEqual([
      ['unknown-style', 'blocks[0]'],
      ['mark-not-allowed', 'blocks[0].content'],
    ]);
  });

  it('warns about headings and tables without an ID and rejects duplicates', () => {
    const noId: Heading = { type: 'heading', level: 1, content: [run('a')] };
    const list: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [{ ...table(), id: A }] }],
    };
    const result = validateDocument(
      documentOf(noId, paragraph([run('p')]), heading([run('b')]), list),
      stylesheet,
    );
    expect(result.map((d) => [d.severity, d.code, d.path])).toEqual([
      ['warning', 'missing-id', 'blocks[0]'],
      ['error', 'duplicate-id', 'blocks[3].items[0].blocks[0]'],
    ]);
    expect(result[1]?.nodeId).toBe(A);
    expect(result[1]?.message).toContain('blocks[2]');
  });

  it('accepts paragraphs and lists in a cell, and checks the marks of a list item against its list', () => {
    const list = (mark: Mark): Block => ({
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph([run('a', mark)])] }],
    });
    const cell = (...blocks: Block[]): Table =>
      table({
        header: [{ blocks: [paragraph([run('H')])] }],
        rows: [[{ blocks: blocks as never }]],
      });
    expect(problems(documentOf(cell(paragraph([run('p')]), list(emphasis))))).toEqual([]);
    // List items allow emphasis but not strong.
    expect(problems(documentOf(cell(paragraph([run('p')]), list(strong))))).toEqual([
      ['mark-not-allowed', 'blocks[0].rows[0][0].blocks[1].items[0].blocks[0].content'],
    ]);
  });

  it('refuses blocks that a cell may not hold, in the cell and in a list of the cell', () => {
    const nested = table({ id: id('cccccccccc') });
    const inCell = (...blocks: Block[]): Table =>
      table({ header: [plainCell([run('H')])], rows: [[{ blocks: blocks as never }]] });
    expect(
      problems(
        documentOf(
          inCell(heading([run('x')]), { type: 'code', text: 'x' }, nested, {
            type: 'list',
            kind: 'bulleted',
            items: [{ blocks: [{ type: 'code', text: 'y' }] }],
          }),
        ),
      ),
    ).toEqual([
      ['table-cell-block', 'blocks[0].rows[0][0].blocks[0]'],
      ['table-cell-block', 'blocks[0].rows[0][0].blocks[1]'],
      ['table-cell-block', 'blocks[0].rows[0][0].blocks[2]'],
      ['table-cell-block', 'blocks[0].rows[0][0].blocks[3].items[0].blocks[0]'],
    ]);
  });

  it('refuses an ID or a style on a block in a cell', () => {
    const cell = table({
      header: [plainCell([run('H')])],
      rows: [
        [
          {
            blocks: [
              paragraph([run('x')], { style: n('note') }),
              paragraph([run('y')], { id: id('dddddddddd') }),
            ],
          },
        ],
      ],
    });
    expect(problems(documentOf(cell))).toEqual([
      ['table-cell-block', 'blocks[0].rows[0][0].blocks[0]'],
      ['table-cell-block', 'blocks[0].rows[0][0].blocks[1]'],
    ]);
  });

  it('checks that tables are rectangular and have matching widths', () => {
    const cell = plainCell([run('x')]);
    expect(
      problems(
        documentOf(
          table({ header: [], rows: [] }),
          table({ id: id('eeeeeeeeee'), rows: [[cell, cell], [], [cell]] }),
          table({ id: id('ffffffffff'), widths: [1, 2] }),
        ),
      ),
    ).toEqual([
      ['table-no-columns', 'blocks[0]'],
      ['table-ragged-row', 'blocks[1].rows[0]'],
      ['table-ragged-row', 'blocks[1].rows[1]'],
      ['table-widths-mismatch', 'blocks[2]'],
    ]);
  });

  it('reports stanza blocks, since no kind is supported yet', () => {
    const result = validateDocument(
      documentOf({ type: 'stanza', kind: 'diagram', text: 'x' }),
      stylesheet,
    );
    expect(result).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unknown-stanza-kind',
        path: 'blocks[0]',
      }),
    ]);
  });

  it('skips the mark checks when the default style is missing', () => {
    const incomplete = sheet({ paragraph: { body: undefined, 'heading-1': undefined } });
    expect(
      validateDocument(
        documentOf(heading([run('a', strong)]), paragraph([run('b', strong)])),
        incomplete,
      ),
    ).toEqual([]);
  });
});
