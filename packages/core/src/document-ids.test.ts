import { describe, expect, it } from 'vitest';
import { collectBlockIds } from './document-ids.js';
import type { Document } from './document.js';
import { isNodeId, type NodeId } from './ids.js';

function id(value: string): NodeId {
  if (!isNodeId(value)) throw new Error(`invalid test ID ${value}`);
  return value;
}

const text = [{ type: 'text' as const, text: 'x', marks: [] }];

describe('collectBlockIds', () => {
  it('lists IDs in document order, with nested blocks and their paths', () => {
    const document: Document = {
      meta: { fields: {} },
      blocks: [
        { type: 'heading', level: 1, id: id('aaaaaaaaaa'), content: text },
        { type: 'paragraph', content: text },
        {
          type: 'list',
          kind: 'bulleted',
          id: id('bbbbbbbbbb'),
          items: [
            {
              blocks: [
                { type: 'paragraph', content: text },
                {
                  type: 'list',
                  kind: 'numbered',
                  items: [{ blocks: [{ type: 'paragraph', id: id('cccccccccc'), content: text }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(collectBlockIds(document)).toEqual([
      { id: 'aaaaaaaaaa', path: 'blocks[0]' },
      { id: 'bbbbbbbbbb', path: 'blocks[2]' },
      { id: 'cccccccccc', path: 'blocks[2].items[0].blocks[1].items[0].blocks[0]' },
    ]);
  });

  it('finds nothing in a document without IDs', () => {
    expect(
      collectBlockIds({ meta: { fields: {} }, blocks: [{ type: 'paragraph', content: text }] }),
    ).toEqual([]);
  });
});
