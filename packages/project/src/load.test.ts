import { describe, expect, it } from 'vitest';
import { loadProject } from './load.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const GOOD_DOCUMENT = (id: string, extra = ''): string =>
  `---\nphrase-format: 1\ntitle: "Doc"\ndocument-number: "N-1"\n---\n\n<!-- phrase: #${id} -->\n# Heading\n\n${extra}`;

const summary = (diagnostics: readonly { file: string; code: string }[]): string[] =>
  diagnostics.map((d) => `${d.file}: ${d.code}`);

describe('loadProject', () => {
  it('loads the example project without diagnostics, documents in path order', async () => {
    const loaded = await loadProject(memoryStorage(exampleProject()));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.documents.map((d) => d.path)).toEqual([
      'documents/introduction.phrase.md',
      'documents/reference.phrase.md',
    ]);
    expect(loaded.settings?.title).toBe('Example project');
    expect(loaded.stylesheet?.paragraphStyles.has('body' as never)).toBe(true);
  });

  it('reports a project file that cannot be read, and stops', async () => {
    const files = exampleProject();
    delete files['phrase.yaml'];
    const loaded = await loadProject(memoryStorage(files));
    expect(summary(loaded.diagnostics)).toEqual(['phrase.yaml: file-unreadable']);
    expect(loaded.settings).toBeUndefined();
    expect(loaded.documents).toEqual([]);
  });

  it('stops after the project file when it has errors, without reading the rest', async () => {
    const storage = memoryStorage({ ...exampleProject(), 'phrase.yaml': 'phrase-format: 1\n' });
    const loaded = await loadProject(storage);
    expect(summary(loaded.diagnostics)).toEqual(['phrase.yaml: missing-property']);
    expect(storage.reads).toEqual(['phrase.yaml']);
    expect(loaded.settings).toBeUndefined();
  });

  it('reports a stylesheet that cannot be read, and reads no documents', async () => {
    const files = exampleProject();
    delete files['styles/default.yaml'];
    const storage = memoryStorage(files);
    const loaded = await loadProject(storage);
    expect(summary(loaded.diagnostics)).toEqual(['styles/default.yaml: file-unreadable']);
    expect(loaded.settings).toBeDefined();
    expect(loaded.stylesheet).toBeUndefined();
    expect(storage.reads).toEqual(['phrase.yaml', 'styles/default.yaml']);
  });

  it('reports stylesheet errors under the path of the stylesheet, and reads no documents', async () => {
    const files = { ...exampleProject(), 'styles/default.yaml': 'phrase-format: 1\nbogus: 1\n' };
    const storage = memoryStorage(files);
    const loaded = await loadProject(storage);
    expect(loaded.diagnostics.every((d) => d.file === 'styles/default.yaml')).toBe(true);
    expect(loaded.diagnostics.map((d) => d.code)).toContain('unknown-property');
    expect(loaded.documents).toEqual([]);
    expect(storage.reads).toEqual(['phrase.yaml', 'styles/default.yaml']);
  });

  it('reports problems of a document under its path, with the line when there is one', async () => {
    const files = {
      ...exampleProject(),
      'documents/bad.phrase.md':
        '---\nphrase-format: 1\ntitle: "Bad"\n---\n\n<!-- phrase: .missing -->\nText\n',
    };
    const loaded = await loadProject(memoryStorage(files));
    expect(summary(loaded.diagnostics)).toEqual([
      'documents/bad.phrase.md: unknown-style',
      'documents/bad.phrase.md: missing-field',
    ]);
    expect(loaded.diagnostics[1]?.path).toBe('document-number');
    expect(loaded.documents.map((d) => d.path)[0]).toBe('documents/bad.phrase.md');
  });

  it('finds documents at any depth and skips hidden folders, node_modules and other files', async () => {
    const files = {
      ...exampleProject(),
      'deep/er/c.phrase.md': GOOD_DOCUMENT('c3d4e5f6g7'),
      'node_modules/x/a.phrase.md': GOOD_DOCUMENT('d4e5f6g7h8'),
      '.git/b.phrase.md': GOOD_DOCUMENT('e5f6g7h8j9'),
      'notes.md': '# Not a document',
    };
    const loaded = await loadProject(memoryStorage(files));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.documents.map((d) => d.path)).toEqual([
      'deep/er/c.phrase.md',
      'documents/introduction.phrase.md',
      'documents/reference.phrase.md',
    ]);
  });

  it('reports an ID that two documents share, in the later document', async () => {
    const files = { ...exampleProject(), 'documents/zzz.phrase.md': GOOD_DOCUMENT('k7m2q9x4zb') };
    const loaded = await loadProject(memoryStorage(files));
    expect(loaded.diagnostics).toEqual([
      expect.objectContaining({
        file: 'documents/zzz.phrase.md',
        code: 'duplicate-id',
        path: 'blocks[0]',
        message: expect.stringContaining('documents/introduction.phrase.md at blocks[0]') as string,
      }),
    ]);
  });

  it('does not repeat a duplicate that the document already reports itself', async () => {
    const files = {
      ...exampleProject(),
      'documents/twice.phrase.md': GOOD_DOCUMENT(
        'f6g7h8j9k1',
        '<!-- phrase: #f6g7h8j9k1 -->\n## Again\n',
      ),
    };
    const loaded = await loadProject(memoryStorage(files));
    expect(summary(loaded.diagnostics)).toEqual(['documents/twice.phrase.md: duplicate-id']);
  });

  it('reports a default page template that the stylesheet does not have, and stops', async () => {
    const files = exampleProject();
    files['phrase.yaml'] = (files['phrase.yaml'] ?? '').replace(
      "  classification: 'Internal'",
      "  classification: 'Internal'\n  page-template: 'missing'",
    );
    const loaded = await loadProject(memoryStorage(files));
    expect(loaded.diagnostics).toEqual([
      expect.objectContaining({
        file: 'phrase.yaml',
        code: 'unknown-page-template',
        path: 'defaults.page-template',
      }),
    ]);
    expect(loaded.settings).toBeDefined();
    expect(loaded.documents).toEqual([]);
  });

  it('warns about a project without documents', async () => {
    const files = exampleProject();
    delete files['documents/introduction.phrase.md'];
    delete files['documents/reference.phrase.md'];
    const loaded = await loadProject(memoryStorage(files));
    expect(loaded.diagnostics).toEqual([
      expect.objectContaining({ file: 'phrase.yaml', severity: 'warning', code: 'no-documents' }),
    ]);
  });

  it('reports a document that cannot be read and carries on with the others', async () => {
    const storage = memoryStorage(exampleProject(), ['documents/introduction.phrase.md']);
    const loaded = await loadProject(storage);
    expect(summary(loaded.diagnostics)).toEqual([
      'documents/introduction.phrase.md: file-unreadable',
    ]);
    expect(loaded.documents.map((d) => d.path)).toEqual(['documents/reference.phrase.md']);
  });
});

describe('references between documents', () => {
  const withNotes = (extra: string): Record<string, string> => ({
    ...exampleProject(),
    'notes.phrase.md': GOOD_DOCUMENT('abcdefghjk', extra),
  });

  it('accepts a reference to a block of another document of the project', async () => {
    const loaded = await loadProject(
      memoryStorage(withNotes('See [the introduction](#k7m2q9x4zb).\n')),
    );
    expect(loaded.diagnostics.filter((d) => d.code === 'broken-reference')).toEqual([]);
  });

  it('reports a reference to a block that no document has, in the document that holds it', async () => {
    const loaded = await loadProject(memoryStorage(withNotes('See [gone](#zzzzzzzzzz).\n')));
    expect(loaded.diagnostics.filter((d) => d.code === 'broken-reference')).toEqual([
      expect.objectContaining({
        file: 'notes.phrase.md',
        severity: 'error',
        message: expect.stringContaining('which is not in this project') as string,
      }),
    ]);
  });

  it('reports the references to a block that was deleted, in each document that had one', async () => {
    const files = withNotes('See [the introduction](#k7m2q9x4zb).\n');
    const intro = files['documents/introduction.phrase.md'] ?? '';
    files['documents/introduction.phrase.md'] = intro.replace(
      '<!-- phrase: #k7m2q9x4zb -->\n# ',
      '# ',
    );
    const loaded = await loadProject(memoryStorage(files));
    expect(
      loaded.diagnostics.filter((d) => d.code === 'broken-reference').map((d) => d.file),
    ).toEqual(['notes.phrase.md']);
  });
});

describe('the list of documents', () => {
  const withList = (list: string): Record<string, string> => {
    const files = exampleProject();
    files['phrase.yaml'] = `${files['phrase.yaml'] ?? ''}${list}`;
    return files;
  };
  const INTRO = 'documents/introduction.phrase.md';
  const REFERENCE = 'documents/reference.phrase.md';

  it('lists all the documents by path when the project gives no list', async () => {
    const loaded = await loadProject(memoryStorage(exampleProject()));
    expect(loaded.documents.every((d) => d.listed)).toBe(true);
    expect(loaded.outline).toEqual([
      { kind: 'document', path: INTRO },
      { kind: 'document', path: REFERENCE },
    ]);
  });

  it('loads the documents in the order of the list, through the groups', async () => {
    const loaded = await loadProject(
      memoryStorage(
        withList(`documents:\n  - group: Part\n    items:\n      - ${REFERENCE}\n  - ${INTRO}\n`),
      ),
    );
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.documents.map((d) => d.path)).toEqual([REFERENCE, INTRO]);
    expect(loaded.outline).toEqual([
      { kind: 'group', title: 'Part', items: [{ kind: 'document', path: REFERENCE }] },
      { kind: 'document', path: INTRO },
    ]);
  });

  it('warns about a document that is not listed, still checks it, and puts it last', async () => {
    const files = withList(`documents:\n  - ${REFERENCE}\n`);
    files['notes.phrase.md'] = GOOD_DOCUMENT('abcdefghjk');
    const loaded = await loadProject(memoryStorage(files));
    expect(summary(loaded.diagnostics)).toEqual([
      `${INTRO}: unlisted-document`,
      'notes.phrase.md: unlisted-document',
    ]);
    expect(loaded.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(loaded.documents.map((d) => [d.path, d.listed])).toEqual([
      [REFERENCE, true],
      [INTRO, false],
      ['notes.phrase.md', false],
    ]);
  });

  it('checks a document that is not listed like any other', async () => {
    const files = withList(`documents:\n  - ${REFERENCE}\n  - ${INTRO}\n`);
    files['notes.phrase.md'] = '---\nphrase-format: 1\nbogus: 1\n---\n';
    const loaded = await loadProject(memoryStorage(files));
    const own = loaded.diagnostics.filter((d) => d.file === 'notes.phrase.md');
    expect(own.some((d) => d.severity === 'error')).toBe(true);
  });

  it('reports a listed document that does not exist, and one that is not a document file', async () => {
    const loaded = await loadProject(
      memoryStorage(withList(`documents:\n  - ${REFERENCE}\n  - gone.phrase.md\n  - notes.md\n`)),
    );
    expect(loaded.diagnostics.filter((d) => d.file === 'phrase.yaml')).toEqual([
      expect.objectContaining({ code: 'missing-document', severity: 'error', path: 'documents' }),
      expect.objectContaining({ code: 'invalid-path', severity: 'error', path: 'documents' }),
    ]);
    expect(loaded.documents.map((d) => d.path)).toEqual([REFERENCE, INTRO]);
  });

  it('reports a problem in the list as a problem of the project file', async () => {
    const loaded = await loadProject(
      memoryStorage(withList(`documents:\n  - ${INTRO}\n  - ${INTRO}\n`)),
    );
    expect(summary(loaded.diagnostics)).toEqual(['phrase.yaml: duplicate-document']);
    expect(loaded.documents).toEqual([]);
  });
});
