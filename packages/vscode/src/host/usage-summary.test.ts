import { describe, expect, it } from 'vitest';
import type { StyleUsage, StyleUse } from '@stanza/project';
import { summarizeUsage } from './usage-summary.js';

const use = (kind: StyleUse['kind'], file: string, path: string, via?: string): StyleUse => ({
  kind,
  file,
  path,
  ...(via !== undefined ? { via: via as never } : {}),
});

const usage = (
  paragraphs: Record<string, StyleUse[]>,
  characters: Record<string, StyleUse[]> = {},
  tables: Record<string, StyleUse[]> = {},
): StyleUsage =>
  ({
    paragraphStyles: new Map(Object.entries(paragraphs)),
    characterStyles: new Map(Object.entries(characters)),
    tableStyles: new Map(Object.entries(tables)),
  }) as unknown as StyleUsage;

describe('summarizeUsage', () => {
  it('counts the blocks of each document by how they use the style', () => {
    const summary = summarizeUsage(
      usage({
        body: [
          use('default', 'a.stanza.md', 'blocks[0]'),
          use('default', 'a.stanza.md', 'blocks[1]'),
          use('direct', 'a.stanza.md', 'blocks[2]'),
          use('inherited', 'a.stanza.md', 'blocks[3]', 'note'),
          use('default', 'b.stanza.md', 'blocks[0]'),
        ],
      }),
      'a.stanza.md',
    );
    expect(summary.current).toBe('a.stanza.md');
    expect(summary.paragraph['body']).toEqual([
      { file: 'a.stanza.md', direct: 1, default: 2, inherited: 1 },
      { file: 'b.stanza.md', direct: 0, default: 1, inherited: 0 },
    ]);
  });

  it('counts a block once for a kind, however many styles it reaches the style through', () => {
    const summary = summarizeUsage(
      usage({
        body: [
          use('inherited', 'a.stanza.md', 'blocks[0]', 'note'),
          use('inherited', 'a.stanza.md', 'blocks[0]', 'heading-1'),
        ],
      }),
      'a.stanza.md',
    );
    expect(summary.paragraph['body']).toEqual([
      { file: 'a.stanza.md', direct: 0, default: 0, inherited: 1 },
    ]);
  });

  it('leaves out the styles that nothing uses, and keeps the families apart', () => {
    const summary = summarizeUsage(
      usage(
        { body: [], note: [use('direct', 'a.stanza.md', 'blocks[0]')] },
        { status: [] },
        {
          table: [use('default', 'a.stanza.md', 'blocks[1]')],
        },
      ),
      'a.stanza.md',
    );
    expect(Object.keys(summary.paragraph)).toEqual(['note']);
    expect(summary.character).toEqual({});
    expect(Object.keys(summary.table)).toEqual(['table']);
  });
});
