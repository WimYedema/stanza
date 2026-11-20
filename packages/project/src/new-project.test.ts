import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkDocumentText } from '@stanza/format';
import { buildProject } from './build.js';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';
import { AGENT_INSTRUCTIONS } from './agent-instructions.js';
import { createProject, slugOf } from './new-project.js';

const randomBytes = (): Uint8Array => Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

/** What a project holds after `createProject`, as a project in memory. */
async function created(title: string, existing: Record<string, string> = {}) {
  const storage = memoryStorage(existing);
  const result = await createProject(storage, { title, randomBytes });
  return { storage, result, files: Object.fromEntries(storage.texts) };
}

describe('slugOf', () => {
  it.each([
    ['My Report', 'my-report'],
    ['  Café: Menü & more!  ', 'cafe-menu-more'],
    ['日本語', 'document'],
    ['', 'document'],
    ['A'.repeat(60), 'a'.repeat(40)],
  ])('makes %j into %j', (title, slug) => {
    expect(slugOf(title)).toBe(slug);
  });
});

describe('createProject', () => {
  it('writes the project file, the default stylesheet and a first document', async () => {
    const { result, files } = await created('My Report');
    expect(result).toEqual({
      ok: true,
      files: ['stanza.yaml', 'styles/default.yaml', 'documents/my-report.stanza.md'],
      document: 'documents/my-report.stanza.md',
      agentInstructions: 'written',
    });
    expect(files['AGENTS.md']).toBe(AGENT_INSTRUCTIONS);
    expect(files['stanza.yaml']).toBe(
      "stanza-format: 1\ntitle: 'My Report'\nstylesheet: 'styles/default.yaml'\n",
    );
    expect(files['documents/my-report.stanza.md']).toContain('# My Report');
  });

  it('gives a project that loads without diagnostics', async () => {
    const { files } = await created('My Report');
    const loaded = await loadProject(memoryStorage(files));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.settings?.title).toBe('My Report');
    expect(loaded.documents.map((d) => d.path)).toEqual(['documents/my-report.stanza.md']);
  });

  it('gives a first document in canonical form, with an ID on its heading', async () => {
    const { files } = await created('My Report');
    const loaded = await loadProject(memoryStorage(files));
    const stylesheet = loaded.stylesheet;
    if (stylesheet === undefined) throw new Error('No stylesheet.');
    const text = files['documents/my-report.stanza.md'] ?? '';
    const checked = checkDocumentText(text, stylesheet, loaded.settings);
    expect(checked.diagnostics).toEqual([]);
    expect(text).toContain('<!-- stanza: #123456789a -->');
  });

  it('gives a project that builds a DOCX', async () => {
    const { files } = await created('My Report');
    const storage = memoryStorage(files);
    const result = await buildProject(storage, {
      outDir: 'build',
      timestamp: new Date('2026-03-04T05:06:07Z'),
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.written).toEqual(['build/documents/my-report.docx']);
    const bytes = storage.written.get('build/documents/my-report.docx');
    expect(strFromU8(bytes?.subarray(0, 2) ?? new Uint8Array())).toBe('PK');
  });

  it('writes the same files for the same title and bytes', async () => {
    expect((await created('My Report')).files).toEqual((await created('My Report')).files);
  });

  it('keeps a title with quotes and colons intact', async () => {
    const { files } = await created("Dan's plan: v2");
    expect(files['stanza.yaml']).toContain("title: 'Dan''s plan: v2'");
    const loaded = await loadProject(memoryStorage(files));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.settings?.title).toBe("Dan's plan: v2");
  });

  it('refuses an empty title and writes nothing', async () => {
    const { storage, result } = await created('   ');
    expect(result).toEqual({ ok: false, reason: 'empty-title' });
    expect(storage.texts.size).toBe(0);
  });

  it('refuses a folder that has any of the files, and writes nothing', async () => {
    const { storage, result } = await created('My Report', {
      'stanza.yaml': 'stanza-format: 1\n',
      'documents/my-report.stanza.md': '',
      'notes.txt': 'kept',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'exists',
      existing: ['stanza.yaml', 'documents/my-report.stanza.md'],
    });
    expect(storage.texts.size).toBe(0);
  });

  it('writes into a folder that has other files', async () => {
    const { result } = await created('My Report', { 'notes.txt': 'kept' });
    expect(result.ok).toBe(true);
  });

  it('leaves an AGENTS.md that is there alone, writes the project, and says so', async () => {
    const { result, files, storage } = await created('My Report', {
      'AGENTS.md': 'My own rules.\n',
    });
    expect(result).toMatchObject({ ok: true, agentInstructions: 'exists' });
    expect(storage.texts.has('AGENTS.md')).toBe(false);
    expect(files['stanza.yaml']).toBeDefined();
  });
});
