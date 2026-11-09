import { describe, expect, it } from 'vitest';
import { nodeIdFromRandomBytes, plainCell, type Document } from '@phrase/core';
import { exportDocx } from '@phrase/export-docx';
import { loadProject } from './load.js';
import { memoryStorage, type MemoryStorage } from './memory-storage.testing.js';
import { describeImport, importWordDocument } from './import-word.js';
import { createProject } from './new-project.js';

const bytes = (last: number) => (): Uint8Array =>
  Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, last]);

const text = (value: string, marks: readonly { type: 'strong' }[] = []) =>
  ({ type: 'text', text: value, marks }) as const;

/** The files of a new project, as a storage that holds them. */
async function project(): Promise<MemoryStorage> {
  return memoryStorage(await projectFiles());
}

async function projectFiles(): Promise<Record<string, string>> {
  const created = memoryStorage({});
  await createProject(created, { title: 'My Report', randomBytes: bytes(10) });
  return Object.fromEntries(created.texts);
}

/** Random bytes that differ at each call, starting with the given last byte. */
const counting = (first: number) => {
  let next = first;
  return (): Uint8Array => bytes(next++)();
};

/** A Word file made by the exporter, which holds a heading, a paragraph and a table. */
async function wordFile(storage: MemoryStorage): Promise<Uint8Array> {
  const loaded = await loadProject(storage);
  if (loaded.stylesheet === undefined) throw new Error('No stylesheet.');
  const document: Document = {
    meta: { title: 'Threat Model', fields: {} },
    blocks: [
      {
        type: 'heading',
        level: 1,
        id: nodeIdFromRandomBytes(bytes(50)()),
        content: [text('Scope')],
      },
      { type: 'paragraph', content: [text('Some '), text('strong', [{ type: 'strong' }])] },
      {
        type: 'table',
        id: nodeIdFromRandomBytes(bytes(51)()),
        header: [plainCell([text('A')])],
        rows: [[plainCell([text('1')])]],
      },
    ],
  };
  const result = await exportDocx(document, loaded.stylesheet, {
    timestamp: new Date('2026-01-01T00:00:00Z'),
  });
  if (result.bytes === undefined) throw new Error('The export failed.');
  return result.bytes;
}

describe('importWordDocument', () => {
  it('writes the content as a new document, with IDs, and reports', async () => {
    const storage = await project();
    const result = await importWordDocument(storage, await wordFile(storage), {
      name: 'Threat Model',
      randomBytes: counting(20),
    });
    expect(result).toMatchObject({ ok: true, document: 'documents/threat-model.phrase.md' });
    const written = storage.texts.get('documents/threat-model.phrase.md') ?? '';
    expect(written).toContain('# 1 Scope');
    expect(written).toContain('Some **strong**');
    expect(written).toContain('| A |');
    expect(written).toMatch(/<!-- phrase: #[0-9a-z]{10} -->\n# 1 Scope/);
    if (!result.ok) throw new Error(result.message);
    // The number that the exporter wrote into the heading is text now, and the report says so.
    expect(result.report.diagnostics.map((d) => d.code)).toContain('heading-number');
  });

  it('gives a document that loads in the project without errors', async () => {
    const storage = await project();
    const word = await wordFile(storage);
    const result = await importWordDocument(storage, word, {
      name: 'a',
      randomBytes: counting(20),
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.assigned).toBe(2);
    const again = await loadProject(
      memoryStorage({ ...(await projectFiles()), ...Object.fromEntries(storage.texts) }),
    );
    expect(again.diagnostics).toEqual([]);
  });

  it('takes the title from the Word file, else from its name', async () => {
    const storage = await project();
    const word = await wordFile(storage);
    await importWordDocument(storage, word, { name: 'whatever', randomBytes: counting(20) });
    expect(storage.texts.get('documents/whatever.phrase.md')).toContain('title: "Threat Model"');
  });

  it('never writes over a document, and numbers the name instead', async () => {
    const storage = await project();
    const word = await wordFile(storage);
    const options = { name: 'My Report', randomBytes: counting(20) };
    const first = await importWordDocument(storage, word, options);
    expect(first).toMatchObject({ ok: true, document: 'documents/my-report-2.phrase.md' });
    expect(storage.texts.has('documents/my-report.phrase.md')).toBe(false);
  });

  it('does not use an ID that the project has', async () => {
    const storage = await project();
    const word = await wordFile(storage);
    // The first candidate is the ID of the heading of the first document.
    const result = await importWordDocument(storage, word, {
      name: 'a',
      randomBytes: counting(10),
    });
    if (!result.ok) throw new Error(result.message);
    const written = storage.texts.get('documents/a.phrase.md') ?? '';
    expect(written).not.toContain('#123456789a');
    expect(written).toContain('#123456789b');
  });

  it('refuses a file that is not a DOCX, and writes nothing', async () => {
    const storage = await project();
    const result = await importWordDocument(storage, new TextEncoder().encode('no'), {
      name: 'a',
      randomBytes: bytes(20),
    });
    expect(result).toMatchObject({ ok: false, reason: 'not-a-docx' });
    expect(storage.texts.size).toBe(0);
  });

  it('refuses a folder that has no project in order', async () => {
    const storage = memoryStorage({});
    const result = await importWordDocument(storage, new Uint8Array(), {
      name: 'a',
      randomBytes: bytes(20),
    });
    expect(result).toMatchObject({ ok: false, reason: 'no-project' });
  });
});

describe('describeImport', () => {
  it('writes a line for every diagnostic, with its count and places, and the styles', () => {
    const lines = describeImport({
      diagnostics: [
        {
          severity: 'warning',
          code: 'x',
          message: 'Something was changed.',
          count: 3,
          places: ['paragraph 2'],
        },
        { severity: 'info', code: 'y', message: 'Something was left out.', count: 1, places: [] },
      ],
      styles: [{ word: 'heading 1', as: 'heading-1', count: 2 }],
    });
    expect(lines).toEqual([
      'warning: Something was changed. (3 times) Where: paragraph 2.',
      'info: Something was left out.',
      'Word styles used: heading 1 as heading-1 (2).',
    ]);
  });
});
