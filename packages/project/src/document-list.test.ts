import { describe, expect, it } from 'vitest';
import { parseProject } from '@stanza/format';
import { initializeDocumentList } from './document-list.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

describe('initializing the document list', () => {
  it('uses discovery order, skips excluded directories and leaves document content untouched', async () => {
    const files = {
      ...exampleProject(),
      'z.stanza.md': 'not read',
      '.hidden/hidden.stanza.md': 'not listed',
      'node_modules/other.stanza.md': 'not listed',
    };
    const storage = memoryStorage(files);
    expect(await initializeDocumentList(storage)).toMatchObject({ ok: true });
    expect([...storage.texts.keys()]).toEqual(['stanza.yaml']);
    const text = storage.texts.get('stanza.yaml') ?? '';
    expect(parseProject(text).settings.documents).toEqual([
      { kind: 'document', path: 'documents/introduction.stanza.md' },
      { kind: 'document', path: 'documents/reference.stanza.md' },
      { kind: 'document', path: 'z.stanza.md' },
    ]);
    expect(storage.reads.every((path) => path === 'stanza.yaml')).toBe(true);
    const again = memoryStorage({ ...files, 'stanza.yaml': text });
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
      path === 'stanza.yaml' && reads++ > 0
        ? Promise.resolve(`${files[path] ?? ''}# newer\n`)
        : read(path);
    await expect(initializeDocumentList(changed)).rejects.toThrow('changed');
    expect(changed.texts.size).toBe(0);
  });
});
