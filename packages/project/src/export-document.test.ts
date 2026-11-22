import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProject } from './build.js';
import { exportDocument } from './export-document.js';
import { loadProject } from './load.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const options = { outDir: 'build', timestamp: new Date('2026-03-04T05:06:07Z') };
const INTRODUCTION = 'documents/introduction.stanza.md';
const BAD = '---\nstanza-format: 1\ndocument-number: "N"\n---\n\n<!-- stanza: .missing -->\nText\n';

async function run(files: Record<string, string>, path = INTRODUCTION, outDir = 'build') {
  const storage = memoryStorage(files);
  const result = await exportDocument(storage, await loadProject(storage), path, {
    ...options,
    outDir,
  });
  return { storage, result };
}

describe('exportDocument', () => {
  it('passes project link schemes through both project build and single-document export', async () => {
    const files = exampleProject();
    files['stanza.yaml'] =
      `${files['stanza.yaml'] ?? ''}link-schemes:\n  jira: https://example.org/browse/{id}\n`;
    files[INTRODUCTION] = `${files[INTRODUCTION] ?? ''}\n[Ticket](jira://PROJ-123)\n`;
    const { storage, result } = await run(files);
    expect(result.blocked).toBe(false);
    expect(result.diagnostics).toEqual([]);
    const bytes = storage.written.get('build/documents/introduction.docx') ?? new Uint8Array();
    const rels = strFromU8(unzipSync(bytes)['word/_rels/document.xml.rels'] ?? new Uint8Array());
    expect(rels).toContain('https://example.org/browse/PROJ-123');
    const built = memoryStorage(files);
    expect((await buildProject(built, options)).diagnostics).toEqual([]);
    expect(built.written.get('build/documents/introduction.docx')).toEqual(bytes);
    expect(storage.texts.size).toBe(0);
  });

  it('cannot export a local target or a reference whose ID is duplicated in another file', async () => {
    const files = exampleProject();
    const duplicate = files[INTRODUCTION] ?? '';
    files['zz-duplicate.stanza.md'] = duplicate;
    const local = await run(files);
    expect(local.result.blocked).toBe(true);
    expect(local.storage.written.size).toBe(0);
    files['source.stanza.md'] =
      '---\nstanza-format: 1\ndocument-number: "N"\n---\n\n[Target](documents/introduction.stanza.md#k7m2q9x4zb)\n';
    const reference = await run(files, 'source.stanza.md');
    expect(reference.result.diagnostics).toMatchObject([{ code: 'duplicate-id' }]);
    expect(reference.storage.written.size).toBe(0);
  });
  it('writes the DOCX of that document only', async () => {
    const { storage, result } = await run(exampleProject());
    expect(result).toEqual({
      written: 'build/documents/introduction.docx',
      diagnostics: [],
      blocked: false,
    });
    expect([...storage.written.keys()]).toEqual(['build/documents/introduction.docx']);
  });

  it('writes what a build of the project writes for it, with the defaults of the project', async () => {
    const { storage } = await run(exampleProject());
    const built = memoryStorage(exampleProject());
    await buildProject(built, options);
    const path = 'build/documents/introduction.docx';
    const bytes = storage.written.get(path) ?? new Uint8Array();
    expect(Buffer.from(bytes).equals(Buffer.from(built.written.get(path) ?? []))).toBe(true);
    const core = strFromU8(unzipSync(bytes)['docProps/core.xml'] ?? new Uint8Array());
    expect(core).toContain('<dc:creator>Example Author</dc:creator>');
  });

  it('is not stopped by an error in another document', async () => {
    const { storage, result } = await run({ ...exampleProject(), 'documents/bad.stanza.md': BAD });
    expect(result.written).toBe('build/documents/introduction.docx');
    expect(storage.written.size).toBe(1);
  });

  it('writes nothing for a document with an error, and says it did not try', async () => {
    const files = { ...exampleProject(), 'documents/bad.stanza.md': BAD };
    const { storage, result } = await run(files, 'documents/bad.stanza.md');
    expect(result).toEqual({ written: undefined, diagnostics: [], blocked: true });
    expect(storage.written.size).toBe(0);
  });

  it('writes nothing when the project file or the stylesheet has an error', async () => {
    const brokenProject = await run({ ...exampleProject(), 'stanza.yaml': 'stanza-format: 1\n' });
    expect(brokenProject.result.blocked).toBe(true);
    const brokenStyles = await run({
      ...exampleProject(),
      'styles/default.yaml': 'stanza-format: 1\nbad: [',
    });
    expect(brokenStyles.result.blocked).toBe(true);
    expect(brokenProject.storage.written.size + brokenStyles.storage.written.size).toBe(0);
  });

  it('does not take a path that is not a document of the project', async () => {
    const { storage, result } = await run(exampleProject(), 'documents/nope.stanza.md');
    expect(result.blocked).toBe(true);
    expect(storage.written.size).toBe(0);
  });

  it('refuses an output directory outside the project', async () => {
    const { storage, result } = await run(exampleProject(), INTRODUCTION, '../out');
    expect(result.written).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-output-directory' }),
    ]);
    expect(storage.written.size).toBe(0);
  });
});

describe('exportDocument, the revision stamp (ADR 0084)', () => {
  it('embeds the source of the document and the revision the host gives', async () => {
    const files = exampleProject();
    const storage = memoryStorage(files);
    const result = await exportDocument(storage, await loadProject(storage), INTRODUCTION, {
      ...options,
      revisions: (paths) =>
        Promise.resolve(new Map(paths.map((path) => [path, { commit: 'abc123', dirty: false }]))),
    });
    expect(result.written).toBe('build/documents/introduction.docx');
    const parts = unzipSync(
      storage.written.get('build/documents/introduction.docx') ?? new Uint8Array(),
    );
    const custom = strFromU8(parts['docProps/custom.xml'] ?? new Uint8Array());
    expect(custom).toContain('name="stanza-commit"><vt:lpwstr>abc123<');
    expect(custom).toContain('name="stanza-dirty"><vt:lpwstr>false<');
    const item = strFromU8(parts['customXml/item1.xml'] ?? new Uint8Array());
    expect(item).toContain(`path="${INTRODUCTION}"`);
    expect(item).toContain('stanza-format: 1');
  });
});
