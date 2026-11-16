import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProject } from './build.js';
import { exportDocument } from './export-document.js';
import { loadProject } from './load.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const options = { outDir: 'build', timestamp: new Date('2026-03-04T05:06:07Z') };
const INTRODUCTION = 'documents/introduction.phrase.md';
const BAD = '---\nphrase-format: 1\ndocument-number: "N"\n---\n\n<!-- phrase: .missing -->\nText\n';

async function run(files: Record<string, string>, path = INTRODUCTION, outDir = 'build') {
  const storage = memoryStorage(files);
  const result = await exportDocument(storage, await loadProject(storage), path, {
    ...options,
    outDir,
  });
  return { storage, result };
}

describe('exportDocument', () => {
  it('cannot export a local target or a reference whose ID is duplicated in another file', async () => {
    const files = exampleProject();
    const duplicate = files[INTRODUCTION] ?? '';
    files['zz-duplicate.phrase.md'] = duplicate;
    const local = await run(files);
    expect(local.result.blocked).toBe(true);
    expect(local.storage.written.size).toBe(0);
    files['source.phrase.md'] =
      '---\nphrase-format: 1\ndocument-number: "N"\n---\n\n[Target](documents/introduction.phrase.md#k7m2q9x4zb)\n';
    const reference = await run(files, 'source.phrase.md');
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
    const { storage, result } = await run({ ...exampleProject(), 'documents/bad.phrase.md': BAD });
    expect(result.written).toBe('build/documents/introduction.docx');
    expect(storage.written.size).toBe(1);
  });

  it('writes nothing for a document with an error, and says it did not try', async () => {
    const files = { ...exampleProject(), 'documents/bad.phrase.md': BAD };
    const { storage, result } = await run(files, 'documents/bad.phrase.md');
    expect(result).toEqual({ written: undefined, diagnostics: [], blocked: true });
    expect(storage.written.size).toBe(0);
  });

  it('writes nothing when the project file or the stylesheet has an error', async () => {
    const brokenProject = await run({ ...exampleProject(), 'phrase.yaml': 'phrase-format: 1\n' });
    expect(brokenProject.result.blocked).toBe(true);
    const brokenStyles = await run({
      ...exampleProject(),
      'styles/default.yaml': 'phrase-format: 1\nbad: [',
    });
    expect(brokenStyles.result.blocked).toBe(true);
    expect(brokenProject.storage.written.size + brokenStyles.storage.written.size).toBe(0);
  });

  it('does not take a path that is not a document of the project', async () => {
    const { storage, result } = await run(exampleProject(), 'documents/nope.phrase.md');
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
