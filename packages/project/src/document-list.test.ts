import { describe, expect, it } from 'vitest';
import { parseProject } from '@phrase/format';
import { initializeDocumentList } from './document-list.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

describe('initializing the document list', () => {
  it('uses discovery order, skips excluded directories and leaves document content untouched', async () => {
    const files = {
      ...exampleProject(),
      'z.phrase.md': 'not read',
      '.hidden/hidden.phrase.md': 'not listed',
      'node_modules/other.phrase.md': 'not listed',
    };
    const storage = memoryStorage(files);
    expect(await initializeDocumentList(storage)).toMatchObject({ ok: true });
    expect([...storage.texts.keys()]).toEqual(['phrase.yaml']);
    const text = storage.texts.get('phrase.yaml') ?? '';
    expect(parseProject(text).settings.documents).toEqual([
      { kind: 'document', path: 'documents/introduction.phrase.md' },
      { kind: 'document', path: 'documents/reference.phrase.md' },
      { kind: 'document', path: 'z.phrase.md' },
    ]);
    expect(storage.reads.every((path) => path === 'phrase.yaml')).toBe(true);
    const again = memoryStorage({ ...files, 'phrase.yaml': text });
    expect(await initializeDocumentList(again)).toMatchObject({ ok: false });
    expect(again.texts.size).toBe(0);
  });

  it('does not write if discovery fails or the project changes during discovery', async () => {
    const files = exampleProject();
    const storage = memoryStorage(files);
    storage.list = () => Promise.reject(new Error('Cannot list directory'));
    await expect(initializeDocumentList(storage)).rejects.toThrow('Cannot list');
    expect(storage.texts.size).toBe(0);
    const changed = memoryStorage(files);
    const read = changed.readText.bind(changed);
    let reads = 0;
    changed.readText = (path) =>
      path === 'phrase.yaml' && reads++ > 0
        ? Promise.resolve(`${files[path] ?? ''}# newer\n`)
        : read(path);
    await expect(initializeDocumentList(changed)).rejects.toThrow('changed');
    expect(changed.texts.size).toBe(0);
  });
});
