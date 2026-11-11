import { describe, expect, it } from 'vitest';
import { validateDocument } from './document-validation.js';
import type { Block, Document, Inline, Mark, Paragraph } from './document.js';
import { isNodeId, type NodeId } from './ids.js';
import { findBroken, findIncoming, indexReferences, resolveReference } from './references.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';
import { plainCell } from './table-cell.js';

function id(value: string): NodeId {
  if (!isNodeId(value)) throw new Error(`invalid test ID ${value}`);
  return value;
}

const A = id('aaaaaaaaaa');
const B = id('bbbbbbbbbb');
const C = id('cccccccccc');

const run = (text: string, ...marks: Mark[]): Inline => ({ type: 'text', text, marks });
const to = (target: string): Mark => ({ type: 'link', href: `#${target}` });
const heading = (identifier: NodeId | undefined, ...content: Inline[]): Block => ({
  type: 'heading',
  level: 1,
  ...(identifier !== undefined ? { id: identifier } : {}),
  content,
});
const paragraph = (...content: Inline[]): Paragraph => ({ type: 'paragraph', content });
const documentOf = (...blocks: Block[]): Document => ({ meta: { fields: {} }, blocks });

describe('indexReferences', () => {
  const document = documentOf(
    heading(A, run('T6 Pipeline')),
    paragraph(run('See '), run('T6', to(A)), run(' and '), run('gone', to(C)), run('.')),
    {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph(run('item', to(A)))] }],
    },
    {
      type: 'table',
      id: B,
      header: [plainCell([run('H')])],
      rows: [[plainCell([run('cell ', to(B))])]],
    },
  );
  const index = indexReferences(document);

  it('lists the blocks that have an ID as targets, with their kind and path', () => {
    expect([...index.targets.values()]).toEqual([
      { id: A, kind: 'heading', path: 'blocks[0]' },
      { id: B, kind: 'table', path: 'blocks[3]' },
    ]);
  });

  it('finds the references in paragraphs, list items and table cells, in document order', () => {
    expect(index.references.map((r) => [r.target, r.text, r.path])).toEqual([
      [A, 'T6', 'blocks[1].content'],
      [C, 'gone', 'blocks[1].content'],
      [A, 'item', 'blocks[2].items[0].blocks[0].content'],
      [B, 'cell ', 'blocks[3].rows[0][0].blocks[0].content'],
    ]);
  });

  it('resolves a reference to its block, and not one that is not there', () => {
    expect(resolveReference(index, A)?.kind).toBe('heading');
    expect(resolveReference(index, C)).toBeUndefined();
    expect(resolveReference(index, 'not-an-id')).toBeUndefined();
  });

  it('finds the references that point at a block', () => {
    expect(findIncoming(index, A).map((r) => r.path)).toEqual([
      'blocks[1].content',
      'blocks[2].items[0].blocks[0].content',
    ]);
    expect(findIncoming(index, C)).toHaveLength(1);
    expect(findIncoming(index, id('dddddddddd'))).toEqual([]);
  });

  it('finds the broken ones', () => {
    expect(findBroken(index).map((r) => r.text)).toEqual(['gone']);
  });

  it('reads runs with the same destination as one reference, and ignores other links', () => {
    const result = indexReferences(
      documentOf(
        heading(
          A,
          run('Own '),
          run('one', to(A), { type: 'strong' }),
          run(' two', to(A)),
          run('web', { type: 'link', href: 'https://example.com' }),
          run('next', to(B)),
        ),
      ),
    );
    expect(result.references.map((r) => [r.target, r.text, r.blockId])).toEqual([
      [A, 'one two', A],
      [B, 'next', A],
    ]);
  });

  it('keeps the first of two blocks with the same ID', () => {
    const result = indexReferences(documentOf(heading(A, run('one')), heading(A, run('two'))));
    expect(result.targets.get(A)?.path).toBe('blocks[0]');
  });
});

describe('broken references in the validation', () => {
  const stylesheet = sheet({
    paragraph: {
      body: { ...plainStyle, variants: { strong: {}, emphasis: {}, code: {}, link: {} } },
      'heading-1': { ...plainStyle, basedOn: n('body') },
      'list-bulleted': { ...plainStyle },
      'list-numbered': { ...plainStyle },
    },
    table: { 'table-grid': {} },
  });
  const problems = (document: Document) =>
    validateDocument(document, stylesheet)
      .filter((d) => d.code === 'broken-reference')
      .map((d) => [d.severity, d.path, d.nodeId]);

  it('accepts a reference to a heading and to a table', () => {
    expect(
      problems(
        documentOf(heading(A, run('H')), paragraph(run('see', to(A))), {
          type: 'table',
          id: B,
          header: [plainCell([run('H')])],
          rows: [[plainCell([run('x', to(A))])]],
        }),
      ),
    ).toEqual([]);
  });

  it('reports a reference to a block that was deleted, with the block that holds it', () => {
    expect(problems(documentOf(heading(A, run('H', to(C))), paragraph(run('see', to(C)))))).toEqual(
      [
        ['error', 'blocks[0].content', A],
        ['error', 'blocks[1].content', undefined],
      ],
    );
  });

  it('says which block is missing, and what a destination that is not an ID is', () => {
    const found = validateDocument(
      documentOf(heading(A, run('H')), paragraph(run('gone', to(C)), run('title', to('my-title')))),
      stylesheet,
    ).filter((d) => d.code === 'broken-reference');
    expect(found.map((d) => d.message)).toEqual([
      'The reference "gone" points at the block cccccccccc, which is not in this document.',
      'The link "title" goes to "#my-title", which is not the ID of a block.',
    ]);
  });

  it('does not report web links', () => {
    expect(
      problems(
        documentOf(
          heading(A, run('H')),
          paragraph(run('web', { type: 'link', href: 'https://example.com' })),
        ),
      ),
    ).toEqual([]);
  });
});
