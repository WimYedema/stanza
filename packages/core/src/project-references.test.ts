import { describe, expect, it } from 'vitest';
import { validateDocument } from './document-validation.js';
import type { Block, Document, Inline, Mark } from './document.js';
import { isNodeId, type NodeId } from './ids.js';
import {
  findProjectBroken,
  findProjectIncoming,
  indexProjectReferences,
  projectIds,
  resolveProjectReference,
} from './project-references.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';

function id(value: string): NodeId {
  if (!isNodeId(value)) throw new Error(`invalid test ID ${value}`);
  return value;
}

const A = id('aaaaaaaaaa');
const B = id('bbbbbbbbbb');
const C = id('cccccccccc');

const run = (text: string, ...marks: Mark[]): Inline => ({ type: 'text', text, marks });
const to = (target: string): Mark => ({ type: 'link', href: `#${target}` });
const heading = (identifier: NodeId, ...content: Inline[]): Block => ({
  type: 'heading',
  level: 1,
  id: identifier,
  content,
});
const paragraph = (...content: Inline[]): Block => ({ type: 'paragraph', content });
const documentOf = (...blocks: Block[]): Document => ({ meta: { fields: {} }, blocks });

const one = documentOf(heading(A, run('One')), paragraph(run('see '), run('Two', to(B))));
const two = documentOf(
  heading(B, run('Two')),
  paragraph(run('back ', to(A)), run('gone', to(C)), run('and itself', to(B))),
);
const index = indexProjectReferences([
  { file: 'one.stanza.md', document: one },
  { file: 'two.stanza.md', document: two },
]);

describe('the references of a project', () => {
  it('has the blocks of all documents as targets, with the document that holds each', () => {
    expect([...index.targets.values()].map((t) => [t.id, t.file, t.kind])).toEqual([
      [A, 'one.stanza.md', 'heading'],
      [B, 'two.stanza.md', 'heading'],
    ]);
  });

  it('keeps the references of each document, in the order of the documents', () => {
    expect(index.references.map((r) => [r.file, r.target])).toEqual([
      ['one.stanza.md', B],
      ['two.stanza.md', A],
      ['two.stanza.md', C],
      ['two.stanza.md', B],
    ]);
  });

  it('resolves a reference to a block of another document', () => {
    expect(resolveProjectReference(index, B)?.file).toBe('two.stanza.md');
    expect(resolveProjectReference(index, C)).toBeUndefined();
    expect(resolveProjectReference(index, 'my-title')).toBeUndefined();
  });

  it('finds the references that point at a block, in any document', () => {
    expect(findProjectIncoming(index, B).map((r) => [r.file, r.text])).toEqual([
      ['one.stanza.md', 'Two'],
      ['two.stanza.md', 'and itself'],
    ]);
    expect(findProjectIncoming(index, C)).toHaveLength(1);
  });

  it('finds the broken ones with their document, and not one that is in another document', () => {
    expect(findProjectBroken(index).map((r) => [r.file, r.text])).toEqual([
      ['two.stanza.md', 'gone'],
    ]);
  });

  it('keeps the first of two blocks with the same ID', () => {
    const twice = indexProjectReferences([
      { file: 'x.stanza.md', document: documentOf(heading(A, run('x'))) },
      { file: 'y.stanza.md', document: documentOf(heading(A, run('y'))) },
    ]);
    expect(twice.targets.get(A)?.file).toBe('x.stanza.md');
  });

  it('has the IDs of all blocks, for checking one document among several', () => {
    expect([...projectIds([{ document: one }, { document: two }])].sort()).toEqual([A, B]);
  });
});

describe('a broken reference in one of several documents', () => {
  const stylesheet = sheet({
    paragraph: {
      body: { ...plainStyle, variants: { link: {} } },
      'heading-1': { ...plainStyle, basedOn: n('body') },
      'list-bulleted': { ...plainStyle },
      'list-numbered': { ...plainStyle },
    },
    table: { 'table-grid': {} },
  });
  const messages = (document: Document, ids?: ReadonlySet<string>) =>
    validateDocument(document, stylesheet, ids === undefined ? {} : { projectIds: ids })
      .filter((d) => d.code === 'broken-reference')
      .map((d) => d.message);

  it('is reported when the document is checked alone, which knows no other', () => {
    expect(messages(one)).toEqual([
      `The reference "Two" points at the block ${B}, which is not in this document.`,
    ]);
  });

  it('is accepted when the block is in another document of the project', () => {
    expect(messages(one, projectIds([{ document: one }, { document: two }]))).toEqual([]);
  });

  it('is reported when no document of the project has the block, naming the project', () => {
    expect(messages(two, projectIds([{ document: one }, { document: two }]))).toEqual([
      `The reference "gone" points at the block ${C}, which is not in this project.`,
    ]);
  });
});
