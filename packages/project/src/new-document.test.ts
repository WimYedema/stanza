import { describe, expect, it } from 'vitest';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';
import { addDocument } from './new-document.js';
import { createProject } from './new-project.js';

const bytes = (last: number) => (): Uint8Array =>
  Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, last]);

/** A storage that holds a new project, with its files also in `texts` like the ones written later. */
async function project() {
  const created = memoryStorage({});
  await createProject(created, { title: 'My Report', randomBytes: bytes(10) });
  const storage = memoryStorage(Object.fromEntries(created.texts));
  for (const [path, text] of created.texts) storage.texts.set(path, text);
  return storage;
}

describe('addDocument', () => {
  it('writes a document next to the first one, with its title as a heading with an ID', async () => {
    const storage = await project();
    const result = await addDocument(storage, { title: 'Meeting Notes', randomBytes: bytes(11) });
    expect(result).toEqual({ ok: true, document: 'documents/meeting-notes.phrase.md' });
    const text = storage.texts.get('documents/meeting-notes.phrase.md') ?? '';
    expect(text).toContain('title: "Meeting Notes"');
    expect(text).toContain('# Meeting Notes');
    expect(text).toContain('<!-- phrase: #123456789b -->');
  });

  it('gives a project that still loads without diagnostics', async () => {
    const storage = await project();
    await addDocument(storage, { title: 'Meeting Notes', randomBytes: bytes(11) });
    const loaded = await loadProject(memoryStorage(Object.fromEntries(storage.texts)));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.documents.map((d) => d.path)).toEqual([
      'documents/meeting-notes.phrase.md',
      'documents/my-report.phrase.md',
    ]);
  });

  it('writes nothing over a document of that name', async () => {
    const storage = await project();
    const before = storage.texts.get('documents/my-report.phrase.md');
    const result = await addDocument(storage, { title: 'my report', randomBytes: bytes(11) });
    expect(result).toEqual({
      ok: false,
      reason: 'exists',
      existing: 'documents/my-report.phrase.md',
    });
    expect(storage.texts.get('documents/my-report.phrase.md')).toBe(before);
  });

  it('refuses an empty title', async () => {
    const storage = await project();
    const result = await addDocument(storage, { title: '  ', randomBytes: bytes(11) });
    expect(result).toEqual({ ok: false, reason: 'empty-title' });
    expect(storage.texts.size).toBe(4);
  });

  it('makes the same file for the same title and bytes', async () => {
    const one = await project();
    const two = await project();
    await addDocument(one, { title: 'Notes', randomBytes: bytes(11) });
    await addDocument(two, { title: 'Notes', randomBytes: bytes(11) });
    expect(Object.fromEntries(one.texts)).toEqual(Object.fromEntries(two.texts));
  });
});
