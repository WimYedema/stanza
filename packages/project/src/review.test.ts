import { indexReferences, type NodeId } from '@stanza/core';
import { readReview, type ReviewReading } from '@stanza/import-docx';
import { describe, expect, it } from 'vitest';
import { exportDocument } from './export-document.js';
import { loadProject, type LoadedProject } from './load.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';
import { inspectReview } from './review.js';

const INTRODUCTION = 'documents/introduction.stanza.md';

async function example(): Promise<LoadedProject> {
  return loadProject(memoryStorage(exampleProject()));
}

/** The IDs of a document of the project, in document order. */
function idsOf(loaded: LoadedProject, path: string): NodeId[] {
  const found = loaded.documents.find((entry) => entry.path === path);
  return found === undefined ? [] : [...indexReferences(found.document).targets.keys()];
}

const comment = (id: string, block?: NodeId): ReviewReading['comments'][number] => ({
  id,
  author: 'Reviewer',
  text: `Comment ${id}`,
  placement: block === undefined ? 'unplaced' : 'inside',
  ...(block !== undefined ? { block } : {}),
  blocks: block === undefined ? [] : [block],
});

describe('inspectReview', () => {
  it('finds every block with an ID of an exported document among its bookmarks', async () => {
    const storage = memoryStorage(exampleProject());
    const loaded = await loadProject(storage);
    const options = { outDir: 'build', timestamp: new Date('2026-03-04T05:06:07Z') };
    const exported = await exportDocument(storage, loaded, INTRODUCTION, options);
    const bytes = storage.written.get(exported.written ?? '') ?? new Uint8Array();
    const read = readReview(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.review.bookmarks).toEqual(idsOf(loaded, INTRODUCTION));
    expect(inspectReview(loaded, read.review)).toEqual({
      document: INTRODUCTION,
      placed: [],
      unplaced: [],
      missing: [],
      unknown: [],
      bookmarks: idsOf(loaded, INTRODUCTION).length,
    });
  });

  it('places comments by block with document and heading, and reports what it cannot place', async () => {
    const loaded = await example();
    const [first = '' as NodeId, ...rest] = idsOf(loaded, INTRODUCTION);
    const gone = 'zzzzzzzzzz' as NodeId;
    const inspection = inspectReview(loaded, {
      bookmarks: [first, gone],
      comments: [comment('0', first), comment('1', gone), comment('2')],
    });
    expect(inspection.document).toBe(INTRODUCTION);
    expect(inspection.placed).toHaveLength(1);
    expect(inspection.placed[0]?.location).toMatchObject({ document: INTRODUCTION });
    expect(inspection.placed[0]?.location.heading).toBeDefined();
    expect(inspection.unplaced.map((c) => c.id)).toEqual(['1', '2']);
    expect(inspection.unknown).toEqual([gone]);
    expect(inspection.missing).toEqual(rest);
  });

  it('knows no document when no bookmark belongs to the project', async () => {
    const inspection = inspectReview(await example(), { bookmarks: [], comments: [] });
    expect(inspection).toEqual({
      placed: [],
      unplaced: [],
      missing: [],
      unknown: [],
      bookmarks: 0,
    });
  });
});
