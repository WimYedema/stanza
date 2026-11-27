import { describe, expect, it, vi } from 'vitest';
import { pickDocuments, reportLines, resultsJson, spread } from './measure-command.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

describe('pickDocuments', () => {
  it('takes the shortest, the median and the longest document by blocks', () => {
    const documents = [
      { path: 'c.stanza.md', blocks: 30 },
      { path: 'a.stanza.md', blocks: 3 },
      { path: 'e.stanza.md', blocks: 3000 },
      { path: 'b.stanza.md', blocks: 12 },
      { path: 'd.stanza.md', blocks: 80 },
    ];
    expect(pickDocuments(documents)).toEqual([
      { label: 'short', path: 'a.stanza.md', blocks: 3 },
      { label: 'typical', path: 'c.stanza.md', blocks: 30 },
      { label: 'long', path: 'e.stanza.md', blocks: 3000 },
    ]);
  });

  it('measures a document once when the project has fewer than three', () => {
    expect(pickDocuments([{ path: 'only.stanza.md', blocks: 4 }])).toEqual([
      { label: 'short', path: 'only.stanza.md', blocks: 4 },
    ]);
    expect(pickDocuments([])).toEqual([]);
  });
});

describe('spread', () => {
  it('takes p50 and p95 from the sorted values', () => {
    const values = Array.from({ length: 20 }, (_, index) => 20 - index);
    expect(spread(values)).toEqual({ p50: 10, p95: 19 });
    expect(spread([7])).toEqual({ p50: 7, p95: 7 });
  });
});

describe('the report', () => {
  const result = {
    label: 'short' as const,
    path: 'a.stanza.md',
    blocks: 3,
    cold: [
      { visible: 400, editable: 900 },
      { visible: 600, editable: 2500 },
    ],
    warm: [{ visible: 100, editable: 120 }],
    actions: { type: [8, 9], enter: [150], style: [], strong: [20] },
    applied: { type: 2, enter: 1, style: 0, strong: 0 },
  };

  it('says each part against its budget', () => {
    expect(reportLines([result])).toEqual([
      'short: a.stanza.md (3 blocks)',
      '  cold open, visible:  p50 400 ms, p95 600 ms (over 500 ms)',
      '  cold open, editable: p50 900 ms, p95 2500 ms (over 2000 ms)',
      '  warm open, editable: p50 120 ms, p95 120 ms (within 300 ms)',
      '  type: p50 8 ms, p95 9 ms (within 100 ms)',
      '  enter: p50 150 ms, p95 150 ms (over 100 ms)',
      '  style: not measured',
      '  strong: p50 20 ms, p95 20 ms (within 100 ms) (did something in 0 of 1 runs)',
    ]);
  });

  it('keeps the durations beside their spreads in the JSON', () => {
    const json = JSON.parse(resultsJson([result], { runs: 2 })) as {
      runs: number;
      documents: { cold: unknown; summary: { coldEditable: unknown } }[];
    };
    expect(json.runs).toBe(2);
    expect(json.documents[0]?.cold).toEqual(result.cold);
    expect(json.documents[0]?.summary.coldEditable).toEqual({ p50: 900, p95: 2500 });
  });
});
