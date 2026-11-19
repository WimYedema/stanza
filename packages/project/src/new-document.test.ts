import { describe, expect, it } from 'vitest';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';
import { addDocument } from './new-document.js';
import { createProject } from './new-project.js';
import { parseProject } from '@phrase/format';

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
  it('appends to an explicit outline while preserving its groups, comments and existing order', async () => {
    const created = await project();
    const before = `${created.texts.get('phrase.yaml') ?? ''}documents:\n  - group: First\n    items:\n      - documents/my-report.phrase.md # keep\n`;
    const storage = memoryStorage({
      ...Object.fromEntries(created.texts),
      'phrase.yaml': before,
    });
    await addDocument(storage, { title: 'Meeting Notes', randomBytes: bytes(11) });
    const after = storage.texts.get('phrase.yaml') ?? '';
    expect(after).toContain('# keep');
    expect(parseProject(after).settings.documents).toEqual([
      {
        kind: 'group',
        title: 'First',
        items: [{ kind: 'document', path: 'documents/my-report.phrase.md' }],
      },
      { kind: 'document', path: 'documents/meeting-notes.phrase.md' },
    ]);
    expect(
      (
        await loadProject(
          memoryStorage({
            ...Object.fromEntries(created.texts),
            ...Object.fromEntries(storage.texts),
          }),
        )
      ).diagnostics,
    ).toEqual([]);
  });

  it('preflights invalid configuration before writing, and reports a failed list write explicitly', async () => {
    const invalid = memoryStorage({ 'phrase.yaml': 'bad: [' });
    await expect(addDocument(invalid, { title: 'Notes', randomBytes: bytes(11) })).rejects.toThrow(
      'Fix the errors',
    );
    expect(invalid.texts.size).toBe(0);
    const created = await project();
    const storage = memoryStorage({
      ...Object.fromEntries(created.texts),
      'phrase.yaml': `${created.texts.get('phrase.yaml') ?? ''}documents: []\n`,
    });
    const write = storage.writeText.bind(storage);
    storage.writeText = (path, text) =>
      path === 'phrase.yaml' ? Promise.reject(new Error('Read-only project')) : write(path, text);
    await expect(addDocument(storage, { title: 'Notes', randomBytes: bytes(11) })).rejects.toThrow(
      'new file may exist',
    );
    expect(storage.texts.has('documents/notes.phrase.md')).toBe(true);
  });
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
