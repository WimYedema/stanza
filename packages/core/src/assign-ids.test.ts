import { describe, expect, it } from 'vitest';
import { assignMissingIds } from './assign-ids.js';
import type { Block, Document, Heading, Inline, List, Paragraph, Table } from './document.js';
import { isNodeId, nodeIdFromRandomBytes, type NodeId } from './ids.js';

function id(value: string): NodeId {
  if (!isNodeId(value)) throw new Error(`invalid test ID ${value}`);
  return value;
}

const A = 'aaaaaaaaaa';
const B = 'bbbbbbbbbb';
const C = 'cccccccccc';
const D = 'dddddddddd';

function sequence(...values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error('generator exhausted');
    return value;
  };
}

const text: Inline = { type: 'text', text: 'x', marks: [] };
const heading = (idValue?: string): Heading => ({
  type: 'heading',
  level: 2,
  content: [text],
  ...(idValue !== undefined ? { id: id(idValue) } : {}),
});
const table = (idValue?: string): Table => ({
  type: 'table',
  header: [{ content: [text] }],
  rows: [],
  ...(idValue !== undefined ? { id: id(idValue) } : {}),
});
const paragraph: Paragraph = { type: 'paragraph', content: [text] };
const documentOf = (...blocks: Block[]): Document => ({ meta: { fields: {} }, blocks });

describe('assignMissingIds', () => {
  it('adds IDs to headings and tables in document order, including inside lists', () => {
    const list: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph, table()] }],
    };
    const result = assignMissingIds(documentOf(heading(), paragraph, table(), list), {
      used: new Set(),
      generate: sequence(A, B, C),
    });
    expect(result.assigned).toEqual([A, B, C]);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.blocks.map((block) => block.id)).toEqual([A, undefined, B, undefined]);
    const nested = result.document.blocks[3];
    expect(nested?.type === 'list' && nested.items[0]?.blocks[1]?.id).toBe(C);
  });

  it('leaves other blocks and existing IDs alone', () => {
    const existing = heading(A);
    const code: Block = { type: 'code', text: 'x' };
    const result = assignMissingIds(documentOf(existing, paragraph, code), {
      used: new Set(),
      generate: sequence(B),
    });
    expect(result.assigned).toEqual([]);
    expect(result.document.blocks).toEqual([existing, paragraph, code]);
  });

  it('avoids IDs used elsewhere in the project and in the document', () => {
    const result = assignMissingIds(documentOf(heading(A), heading()), {
      used: new Set([B]),
      generate: sequence(A, B, C),
    });
    expect(result.assigned).toEqual([C]);
    expect(result.document.blocks[1]?.id).toBe(C);
  });

  it('is idempotent', () => {
    const options = { used: new Set<string>(), generate: sequence(A, B) };
    const once = assignMissingIds(documentOf(heading(), table()), options);
    const twice = assignMissingIds(once.document, options);
    expect(twice.assigned).toEqual([]);
    expect(twice.document).toEqual(once.document);
  });

  it('reports duplicate IDs without changing them', () => {
    const result = assignMissingIds(documentOf(heading(A), table(A)), {
      used: new Set(),
      generate: sequence(B),
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'duplicate-id', nodeId: A }),
    ]);
    expect(result.document.blocks.map((block) => block.id)).toEqual([A, A]);
  });

  it('gives up after the allowed number of attempts and reports it', () => {
    const result = assignMissingIds(documentOf(heading(), heading()), {
      used: new Set([A]),
      generate: () => A,
      maxAttempts: 3,
    });
    expect(result.assigned).toEqual([]);
    expect(result.document.blocks.map((block) => block.id)).toEqual([undefined, undefined]);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      'id-generation-failed',
      'id-generation-failed',
    ]);
  });

  it('rejects a generator that returns something that is not an ID', () => {
    expect(() =>
      assignMissingIds(documentOf(heading()), { used: new Set(), generate: () => 'nope' }),
    ).toThrow(/generator returned/);
  });

  it('does not change the input', () => {
    const input = documentOf(heading());
    assignMissingIds(input, { used: new Set(), generate: sequence(D) });
    expect(input.blocks[0]?.id).toBeUndefined();
  });
});

describe('nodeIdFromRandomBytes', () => {
  it('maps the low five bits of ten bytes to the alphabet', () => {
    expect(nodeIdFromRandomBytes(new Uint8Array(10))).toBe('0000000000');
    expect(nodeIdFromRandomBytes(new Uint8Array(10).fill(255))).toBe('zzzzzzzzzz');
    expect(nodeIdFromRandomBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(
      '0123456789',
    );
  });

  it('ignores the high bits and extra bytes', () => {
    expect(nodeIdFromRandomBytes(Uint8Array.from({ length: 12 }, (_, i) => 32 * 7 + i))).toBe(
      '0123456789',
    );
  });

  it('needs ten bytes', () => {
    expect(() => nodeIdFromRandomBytes(new Uint8Array(9))).toThrow(RangeError);
  });
});
