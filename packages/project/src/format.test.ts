import { describe, expect, it } from 'vitest';
import { formatDocuments, formatProject } from './format.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const FRONT = '---\nphrase-format: 1\ntitle: "T"\n---\n\n';
const status = (result: Awaited<ReturnType<typeof formatProject>>): string[] =>
  result.files.map((f) => `${f.path}: ${f.status}`);

describe('formatProject', () => {
  it('leaves a canonical project untouched', async () => {
    const storage = memoryStorage(exampleProject());
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual([
      'documents/introduction.phrase.md: unchanged',
      'documents/reference.phrase.md: unchanged',
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(storage.texts.size).toBe(0);
    expect(storage.written.size).toBe(0);
  });

  it('rewrites a document that is not canonical, and not the others', async () => {
    const storage = memoryStorage({
      ...exampleProject(),
      'a.phrase.md': `${FRONT}* one\n* two\n\n1. first\n2. second\n`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)[0]).toBe('a.phrase.md: changed');
    expect([...storage.texts.keys()]).toEqual(['a.phrase.md']);
    expect(storage.texts.get('a.phrase.md')).toBe(`${FRONT}- one\n- two\n\n1. first\n1. second\n`);
  });

  it('turns CRLF line endings and a BOM into the canonical form', async () => {
    const canonical = `${FRONT}Some text.\n`;
    const storage = memoryStorage({
      'a.phrase.md': `\uFEFF${canonical.replace(/\n/g, '\r\n')}`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['a.phrase.md: changed']);
    expect(storage.texts.get('a.phrase.md')).toBe(canonical);
  });

  it('writes nothing when only checking, but still reports the change', async () => {
    const storage = memoryStorage({ 'a.phrase.md': `${FRONT}* one\n` });
    const result = await formatProject(storage, { check: true });
    expect(status(result)).toEqual(['a.phrase.md: changed']);
    expect(storage.texts.size).toBe(0);
  });

  it('formats twice with the same result', async () => {
    const first = memoryStorage({ 'a.phrase.md': `${FRONT}* one\n  * two\n\n**x**   y\n` });
    await formatProject(first, { check: false });
    const once = first.texts.get('a.phrase.md') ?? '';
    const second = memoryStorage({ 'a.phrase.md': once });
    const result = await formatProject(second, { check: false });
    expect(status(result)).toEqual(['a.phrase.md: unchanged']);
    expect(second.texts.size).toBe(0);
  });

  it('refuses a document with something the model cannot keep, and leaves it alone', async () => {
    const storage = memoryStorage({
      'a.phrase.md': `${FRONT}Text.\n\n<div>raw</div>\n\n<!-- phrase: widths="30 70" -->\nNot a table\n`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['a.phrase.md: refused']);
    expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
      ['a.phrase.md', 'html-unsupported'],
      ['a.phrase.md', 'widths-not-table'],
    ]);
    expect(storage.texts.size).toBe(0);
  });

  it('does not need the project file to be in order', async () => {
    const storage = memoryStorage({
      'phrase.yaml': 'not: [valid',
      'a.phrase.md': `${FRONT}* one\n`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['a.phrase.md: changed']);
  });

  it('reports a document that cannot be read and carries on', async () => {
    const storage = memoryStorage(
      { 'a.phrase.md': `${FRONT}* one\n`, 'b.phrase.md': `${FRONT}* one\n` },
      ['a.phrase.md'],
    );
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['b.phrase.md: changed']);
    expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
      ['a.phrase.md', 'file-unreadable'],
    ]);
  });
});

describe('formatDocuments', () => {
  it('formats only the given documents', async () => {
    const storage = memoryStorage({
      'a.phrase.md': `${FRONT}* one\n`,
      'b.phrase.md': `${FRONT}* one\n`,
    });
    const result = await formatDocuments(storage, ['b.phrase.md'], { check: false });
    expect(status({ ...result })).toEqual(['b.phrase.md: changed']);
    expect([...storage.texts.keys()]).toEqual(['b.phrase.md']);
  });
});
