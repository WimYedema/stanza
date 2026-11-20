import { describe, expect, it } from 'vitest';
import { adoptMarkdownDocument } from './adopt-markdown.js';
import { describeImport } from './import-word.js';
import { parseProject } from '@stanza/format';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';
import { bytes, counting, project, projectFiles } from './new-project.testing.js';

const SOURCE =
  '# Notes\n\nSome *text* and a [link][a].\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[a]: https://example.com\n';

describe('adoptMarkdownDocument', () => {
  it('appends an adopted document to an explicit list', async () => {
    const files = await projectFiles();
    const storage = memoryStorage({
      ...files,
      'stanza.yaml': `${files['stanza.yaml'] ?? ''}documents: [documents/my-report.stanza.md]\n`,
    });
    const result = await adoptMarkdownDocument(storage, SOURCE, {
      name: 'Notes',
      randomBytes: counting(20),
    });
    expect(result.ok).toBe(true);
    expect(parseProject(storage.texts.get('stanza.yaml') ?? '').settings.documents).toEqual([
      { kind: 'document', path: 'documents/my-report.stanza.md' },
      { kind: 'document', path: 'documents/notes.stanza.md' },
    ]);
  });
  it('writes the Markdown as a new document, with IDs, and reports', async () => {
    const storage = await project();
    const result = await adoptMarkdownDocument(storage, `${SOURCE}\n> quoted\n`, {
      name: 'Team Notes',
      randomBytes: counting(20),
    });
    expect(result).toMatchObject({ ok: true, document: 'documents/team-notes.stanza.md' });
    if (!result.ok) throw new Error(result.message);
    const written = storage.texts.get('documents/team-notes.stanza.md') ?? '';
    expect(written).toContain('title: "Team Notes"');
    expect(written).toMatch(/<!-- stanza: #[0-9a-z]{10} -->\n# Notes/);
    expect(written).toContain('Some *text* and a [link](https://example.com).');
    expect(result.assigned).toBe(2);
    expect(result.report.diagnostics.map((d) => d.code)).toEqual([
      'blockquote-unsupported',
      'reference-links',
    ]);
  });

  it('gives a document that loads in the project without errors', async () => {
    const storage = await project();
    const result = await adoptMarkdownDocument(storage, SOURCE, {
      name: 'a',
      randomBytes: counting(20),
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const again = await loadProject(
      memoryStorage({ ...(await projectFiles()), ...Object.fromEntries(storage.texts) }),
    );
    expect(again.diagnostics).toEqual([]);
  });

  it('takes the title from the front matter, else from the name of the file', async () => {
    const storage = await project();
    const options = { name: 'whatever', randomBytes: counting(20) };
    await adoptMarkdownDocument(storage, '---\ntitle: Real title\n---\n\nText\n', options);
    expect(storage.texts.get('documents/whatever.stanza.md')).toContain('title: "Real title"');
  });

  it('never writes over a document, and numbers the name instead', async () => {
    const storage = await project();
    const options = { name: 'My Report', randomBytes: counting(20) };
    const result = await adoptMarkdownDocument(storage, SOURCE, options);
    expect(result).toMatchObject({ ok: true, document: 'documents/my-report-2.stanza.md' });
    expect(storage.texts.has('documents/my-report.stanza.md')).toBe(false);
  });

  it('refuses a file that is a Stanza document already, and writes nothing', async () => {
    const storage = await project();
    const result = await adoptMarkdownDocument(
      storage,
      '---\nstanza-format: 1\ntitle: T\n---\n\nText\n',
      { name: 'a', randomBytes: bytes(20) },
    );
    expect(result).toMatchObject({ ok: false, reason: 'already-stanza' });
    expect(storage.texts.size).toBe(0);
  });

  it('refuses a folder that has no project in order', async () => {
    const result = await adoptMarkdownDocument(memoryStorage({}), SOURCE, {
      name: 'a',
      randomBytes: bytes(20),
    });
    expect(result).toMatchObject({ ok: false, reason: 'no-project' });
  });

  it('is described in lines like the Word import', async () => {
    const storage = await project();
    const result = await adoptMarkdownDocument(storage, '# T\n\n> q\n\n---\n', {
      name: 'a',
      randomBytes: counting(20),
    });
    if (!result.ok) throw new Error(result.message);
    expect(describeImport(result.report)).toEqual([
      'warning: Thematic breaks (horizontal rules) were left out. Where: line 5.',
      'info: Block quotes were written as ordinary blocks. Where: line 3.',
    ]);
  });
});
