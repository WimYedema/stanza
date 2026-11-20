import { describe, expect, it } from 'vitest';
import { formatDocuments, formatProject } from './format.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const FRONT = '---\nstanza-format: 1\ntitle: "T"\n---\n\n';
const status = (result: Awaited<ReturnType<typeof formatProject>>): string[] =>
  result.files.map((f) => `${f.path}: ${f.status}`);

describe('formatProject', () => {
  it('leaves a canonical project untouched', async () => {
    const storage = memoryStorage(exampleProject());
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual([
      'documents/introduction.stanza.md: unchanged',
      'documents/reference.stanza.md: unchanged',
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(storage.texts.size).toBe(0);
    expect(storage.written.size).toBe(0);
  });

  it('rewrites a document that is not canonical, and not the others', async () => {
    const storage = memoryStorage({
      ...exampleProject(),
      'a.stanza.md': `${FRONT}* one\n* two\n\n1. first\n2. second\n`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)[0]).toBe('a.stanza.md: changed');
    expect([...storage.texts.keys()]).toEqual(['a.stanza.md']);
    expect(storage.texts.get('a.stanza.md')).toBe(`${FRONT}- one\n- two\n\n1. first\n1. second\n`);
  });

  it('turns CRLF line endings and a BOM into the canonical form', async () => {
    const canonical = `${FRONT}Some text.\n`;
    const storage = memoryStorage({
      'a.stanza.md': `\uFEFF${canonical.replace(/\n/g, '\r\n')}`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['a.stanza.md: changed']);
    expect(storage.texts.get('a.stanza.md')).toBe(canonical);
  });

  it('writes nothing when only checking, but still reports the change', async () => {
    const storage = memoryStorage({ 'a.stanza.md': `${FRONT}* one\n` });
    const result = await formatProject(storage, { check: true });
    expect(status(result)).toEqual(['a.stanza.md: changed']);
    expect(storage.texts.size).toBe(0);
  });

  it('formats twice with the same result', async () => {
    const first = memoryStorage({ 'a.stanza.md': `${FRONT}* one\n  * two\n\n**x**   y\n` });
    await formatProject(first, { check: false });
    const once = first.texts.get('a.stanza.md') ?? '';
    const second = memoryStorage({ 'a.stanza.md': once });
    const result = await formatProject(second, { check: false });
    expect(status(result)).toEqual(['a.stanza.md: unchanged']);
    expect(second.texts.size).toBe(0);
  });

  it('refuses a document with something the model cannot keep, and leaves it alone', async () => {
    const storage = memoryStorage({
      'a.stanza.md': `${FRONT}Text.\n\n<div>raw</div>\n\n<!-- stanza: widths="30 70" -->\nNot a table\n`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['a.stanza.md: refused']);
    expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
      ['a.stanza.md', 'html-unsupported'],
      ['a.stanza.md', 'widths-not-table'],
    ]);
    expect(storage.texts.size).toBe(0);
  });

  it('does not need the project file to be in order', async () => {
    const storage = memoryStorage({
      'stanza.yaml': 'not: [valid',
      'a.stanza.md': `${FRONT}* one\n`,
    });
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['a.stanza.md: changed']);
  });

  it('reports a document that cannot be read and carries on', async () => {
    const storage = memoryStorage(
      { 'a.stanza.md': `${FRONT}* one\n`, 'b.stanza.md': `${FRONT}* one\n` },
      ['a.stanza.md'],
    );
    const result = await formatProject(storage, { check: false });
    expect(status(result)).toEqual(['b.stanza.md: changed']);
    expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
      ['a.stanza.md', 'file-unreadable'],
    ]);
  });
});

describe('formatDocuments', () => {
  it.each(['unreadable', 'lossy', 'duplicate'])(
    'refuses reference fixes when the project snapshot is %s',
    async (kind) => {
      const source = `${FRONT}[See](old.stanza.md#aaaaaaaaaa)\n`;
      const target = `${FRONT}<!-- stanza: #aaaaaaaaaa -->\n# Target\n`;
      const storage = memoryStorage(
        {
          'source.stanza.md': source,
          'target.stanza.md': target,
          'other.stanza.md':
            kind === 'lossy'
              ? `${FRONT}> unsupported\n`
              : kind === 'duplicate'
                ? target
                : `${FRONT}Other\n`,
        },
        kind === 'unreadable' ? ['other.stanza.md'] : [],
      );
      const result = await formatProject(storage, {
        check: false,
        fixReferences: true,
        files: ['source.stanza.md'],
      });
      expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
      expect(result.files).toEqual([]);
      expect(storage.texts.size).toBe(0);
    },
  );
  it('fixes stale paths only on request, respects selection and is deterministic', async () => {
    const original = `${FRONT}[See](old.stanza.md#aaaaaaaaaa)\n`;
    const storage = memoryStorage({
      'source.stanza.md': original,
      'unselected.stanza.md': original,
      'target.stanza.md': `${FRONT}<!-- stanza: #aaaaaaaaaa -->\n# Target\n`,
    });
    await formatProject(storage, { check: false, files: ['source.stanza.md'] });
    expect(storage.texts.size).toBe(0);
    const checked = await formatProject(storage, {
      check: true,
      files: ['source.stanza.md'],
      fixReferences: true,
    });
    expect(checked.files).toMatchObject([{ path: 'source.stanza.md', status: 'changed' }]);
    expect(storage.texts.size).toBe(0);
    await formatProject(storage, {
      check: false,
      files: ['source.stanza.md'],
      fixReferences: true,
    });
    expect([...storage.texts.keys()]).toEqual(['source.stanza.md']);
    const fixed = storage.texts.get('source.stanza.md') ?? '';
    expect(fixed).toBe(original.replace('old.stanza.md', 'target.stanza.md'));
    const again = memoryStorage({
      'source.stanza.md': fixed,
      'target.stanza.md': `${FRONT}<!-- stanza: #aaaaaaaaaa -->\n# Target\n`,
    });
    expect(
      (await formatProject(again, { check: true, fixReferences: true })).files.every(
        (file) => file.status === 'unchanged',
      ),
    ).toBe(true);
  });
  it('reserves IDs in unselected documents but writes only the selected file', async () => {
    const storage = memoryStorage({
      'a.stanza.md': `${FRONT}# New\n`,
      'b.stanza.md': `${FRONT}<!-- stanza: #aaaaaaaaaa -->\n# Existing\n`,
    });
    const candidates = ['aaaaaaaaaa', 'bbbbbbbbbb'];
    const result = await formatProject(storage, {
      check: false,
      files: ['a.stanza.md'],
      generateId: () => candidates.shift() ?? 'bbbbbbbbbb',
    });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'changed', assigned: 1 }]);
    expect([...storage.texts.keys()]).toEqual(['a.stanza.md']);
    expect(storage.texts.get('a.stanza.md')).toContain('#bbbbbbbbbb');
  });

  it('does not assign IDs when an unselected document cannot be read', async () => {
    const storage = memoryStorage(
      { 'a.stanza.md': `${FRONT}# New\n`, 'b.stanza.md': `${FRONT}# Other\n` },
      ['b.stanza.md'],
    );
    const result = await formatProject(storage, {
      check: false,
      files: ['a.stanza.md'],
      generateId: () => 'aaaaaaaaaa',
    });
    expect(result.diagnostics.map((d) => d.code)).toEqual(['file-unreadable', 'ids-not-assigned']);
    expect(storage.texts.size).toBe(0);
  });

  it('refuses a missing selection before writing any file', async () => {
    const storage = memoryStorage({ 'a.stanza.md': `${FRONT}* one\n` });
    const result = await formatProject(storage, {
      check: false,
      files: ['a.stanza.md', 'missing.stanza.md'],
    });
    expect(result.files).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['invalid-selection']);
    expect(storage.texts.size).toBe(0);
  });

  it('formats only the given documents', async () => {
    const storage = memoryStorage({
      'a.stanza.md': `${FRONT}* one\n`,
      'b.stanza.md': `${FRONT}* one\n`,
    });
    const result = await formatDocuments(storage, ['b.stanza.md'], { check: false });
    expect(status({ ...result })).toEqual(['b.stanza.md: changed']);
    expect([...storage.texts.keys()]).toEqual(['b.stanza.md']);
  });
});

describe('formatProject with generateId', () => {
  const A = 'aaaaaaaaaa';
  const B = 'bbbbbbbbbb';
  const C = 'cccccccccc';
  const D = 'dddddddddd';
  const doc = (body: string): string => `${FRONT}${body}`;
  const TABLE = '| A | B |\n| - | - |\n| 1 | 2 |\n';
  /** Gives the IDs in order, and the last one again and again. */
  const generator = (...ids: string[]): { generate: () => string; calls: () => number } => {
    let calls = 0;
    return {
      generate: () => ids[Math.min(calls++, ids.length - 1)] ?? '',
      calls: () => calls,
    };
  };
  const ids = (storage: ReturnType<typeof memoryStorage>, path: string): string[] =>
    [...(storage.texts.get(path) ?? '').matchAll(/<!-- stanza: #(\w+)/g)].map((m) => m[1] ?? '');

  it('gives headings and tables without an ID a new one, in document order', async () => {
    const storage = memoryStorage({ 'a.stanza.md': doc(`# One\n\n## Two\n\n${TABLE}`) });
    const { generate } = generator(A, B, C);
    const result = await formatProject(storage, { check: false, generateId: generate });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'changed', assigned: 3 }]);
    expect(ids(storage, 'a.stanza.md')).toEqual([A, B, C]);
    expect(storage.texts.get('a.stanza.md')).toContain(`<!-- stanza: #${A} -->\n# One`);
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps the IDs that exist, and changes nothing on a second run', async () => {
    const storage = memoryStorage({
      'a.stanza.md': doc(`<!-- stanza: #${D} -->\n# One\n\n## Two\n`),
    });
    const first = generator(A);
    await formatProject(storage, { check: false, generateId: first.generate });
    expect(ids(storage, 'a.stanza.md')).toEqual([D, A]);

    const again = memoryStorage({ 'a.stanza.md': storage.texts.get('a.stanza.md') ?? '' });
    const second = generator(B);
    const result = await formatProject(again, { check: false, generateId: second.generate });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'unchanged', assigned: 0 }]);
    expect(again.texts.size).toBe(0);
    expect(second.calls()).toBe(0);
  });

  it('adds no IDs without a generator', async () => {
    const storage = memoryStorage({ 'a.stanza.md': doc('# One\n') });
    const result = await formatProject(storage, { check: false });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'unchanged', assigned: 0 }]);
  });

  it('only counts the missing IDs when checking, and writes nothing', async () => {
    const storage = memoryStorage({ 'a.stanza.md': doc(`# One\n\n${TABLE}`) });
    const result = await formatProject(storage, {
      check: true,
      generateId: generator(A, B).generate,
    });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'changed', assigned: 2 }]);
    expect(storage.texts.size).toBe(0);
  });

  it('keeps new IDs unique across documents, including documents that are refused', async () => {
    const storage = memoryStorage({
      'a.stanza.md': doc('# One\n'),
      'b.stanza.md': doc('# Two\n'),
      'c.stanza.md': doc(`<!-- stanza: #${C} -->\n# Three\n\n<div>raw</div>\n`),
      'd.stanza.md': doc(`<!-- stanza: #${D} -->\n# Four\n`),
    });
    // The first candidates are taken by an existing ID, and by the document before.
    const { generate } = generator(C, D, A, A, B);
    const result = await formatProject(storage, { check: false, generateId: generate });
    expect(result.files.map((f) => `${f.path}: ${f.status} ${String(f.assigned)}`)).toEqual([
      'a.stanza.md: changed 1',
      'b.stanza.md: changed 1',
      'c.stanza.md: refused 0',
      'd.stanza.md: unchanged 0',
    ]);
    expect(ids(storage, 'a.stanza.md')).toEqual([A]);
    expect(ids(storage, 'b.stanza.md')).toEqual([B]);
    expect(storage.texts.has('c.stanza.md')).toBe(false);
  });

  it('assigns nothing when a document cannot be read, and still formats the others', async () => {
    const storage = memoryStorage(
      { 'a.stanza.md': doc('# One\n'), 'b.stanza.md': doc('* one\n') },
      ['a.stanza.md'],
    );
    const { generate, calls } = generator(A);
    const result = await formatProject(storage, { check: false, generateId: generate });
    expect(result.files).toEqual([{ path: 'b.stanza.md', status: 'changed', assigned: 0 }]);
    expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
      ['a.stanza.md', 'file-unreadable'],
      ['a.stanza.md', 'ids-not-assigned'],
    ]);
    expect(calls()).toBe(0);
  });

  it('leaves a document alone when no unused ID can be found', async () => {
    const storage = memoryStorage({
      'a.stanza.md': doc(`<!-- stanza: #${A} -->\n# One\n\n## Two\n`),
    });
    const result = await formatProject(storage, {
      check: false,
      generateId: generator(A).generate,
    });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'refused', assigned: 0 }]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['id-generation-failed']);
    expect(storage.texts.size).toBe(0);
  });

  it('reports an ID that is used twice in a document, and still adds the missing ones', async () => {
    const storage = memoryStorage({
      'a.stanza.md': doc(
        `<!-- stanza: #${A} -->\n# One\n\n<!-- stanza: #${A} -->\n## Two\n\n### Three\n`,
      ),
    });
    const result = await formatProject(storage, {
      check: false,
      generateId: generator(B).generate,
    });
    expect(result.files).toEqual([{ path: 'a.stanza.md', status: 'changed', assigned: 1 }]);
    expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
      ['a.stanza.md', 'duplicate-id'],
    ]);
    expect(ids(storage, 'a.stanza.md')).toEqual([A, A, B]);
  });
});
