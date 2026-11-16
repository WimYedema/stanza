import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProject, outputPath } from './build.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const TIMESTAMP = new Date('2026-03-04T05:06:07Z');
const options = { outDir: 'build', timestamp: TIMESTAMP };

describe('outputPath', () => {
  it('mirrors the document path under the output directory', () => {
    expect(outputPath('build', 'documents/a.phrase.md')).toBe('build/documents/a.docx');
    expect(outputPath('out/x', 'b.phrase.md')).toBe('out/x/b.docx');
  });
});

describe('buildProject', () => {
  it('writes one DOCX per document', async () => {
    const storage = memoryStorage(exampleProject());
    const result = await buildProject(storage, options);
    expect(result.diagnostics).toEqual([]);
    expect(result.documents).toBe(2);
    expect(result.written).toEqual([
      'build/documents/introduction.docx',
      'build/documents/reference.docx',
    ]);
    expect([...storage.written.keys()]).toEqual(result.written);
    for (const bytes of storage.written.values()) {
      expect(strFromU8(bytes.subarray(0, 2))).toBe('PK');
    }
  });

  describe('a reference to a block of another document', () => {
    const NOTES =
      '---\nphrase-format: 1\ntitle: "Notes"\ndocument-number: "N-2"\n---\n\nSee [the introduction](#k7m2q9x4zb).\n';
    const relsOf = (storage: ReturnType<typeof memoryStorage>, path: string): string =>
      strFromU8(
        unzipSync(storage.written.get(path) ?? new Uint8Array())['word/_rels/document.xml.rels'] ??
          new Uint8Array(),
      );

    it('exports filename hints by definitive ID and file-only links as DOCX paths without modifying source', async () => {
      const source =
        NOTES.replace('#k7m2q9x4zb', 'stale.phrase.md#k7m2q9x4zb') +
        '\nSee [reference](documents/reference.phrase.md).\n';
      const storage = memoryStorage({ ...exampleProject(), 'notes.phrase.md': source });
      const result = await buildProject(storage, options);
      expect(result.diagnostics.map((d) => d.code)).toEqual(['stale-reference-path']);
      expect(relsOf(storage, 'build/notes.docx')).toContain('Target="documents/introduction.docx"');
      expect(relsOf(storage, 'build/notes.docx')).toContain('Target="documents/reference.docx"');
      expect(relsOf(storage, 'build/notes.docx')).not.toContain('.phrase.md');
      expect(storage.texts.size).toBe(0);
    });

    it('becomes a link to the file of that document', async () => {
      const storage = memoryStorage({ ...exampleProject(), 'notes.phrase.md': NOTES });
      const result = await buildProject(storage, options);
      expect(result.diagnostics).toEqual([]);
      expect(relsOf(storage, 'build/notes.docx')).toContain(
        'Target="documents/introduction.docx" TargetMode="External"',
      );
    });

    it('is written with a warning when that document is not built', async () => {
      const files: Record<string, string> = { ...exampleProject(), 'notes.phrase.md': NOTES };
      files['phrase.yaml'] = `${files['phrase.yaml'] ?? ''}documents:\n  - notes.phrase.md\n`;
      const storage = memoryStorage(files);
      const result = await buildProject(storage, options);
      expect(result.written).toEqual(['build/notes.docx']);
      expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
        ['documents/introduction.phrase.md', 'unlisted-document'],
        ['documents/reference.phrase.md', 'unlisted-document'],
        ['notes.phrase.md', 'reference-to-unbuilt-document'],
      ]);
    });

    it('stops the build when the block is gone', async () => {
      const files = {
        ...exampleProject(),
        'notes.phrase.md': NOTES.replace('k7m2q9x4zb', 'zzzzzzzzzz'),
      };
      const result = await buildProject(memoryStorage(files), options);
      expect(result.written).toEqual([]);
      expect(result.diagnostics.map((d) => d.code)).toContain('broken-reference');
    });
  });

  it('builds only the documents of the list, and says that the others are not built', async () => {
    const files = exampleProject();
    files['phrase.yaml'] =
      `${files['phrase.yaml'] ?? ''}documents:\n  - documents/reference.phrase.md\n`;
    const storage = memoryStorage(files);
    const result = await buildProject(storage, options);
    expect(result.documents).toBe(1);
    expect(result.written).toEqual(['build/documents/reference.docx']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        file: 'documents/introduction.phrase.md',
        severity: 'warning',
        code: 'unlisted-document',
      }),
    ]);
  });

  it('gives the same bytes for the same project and date, and other bytes for another date', async () => {
    const build = async (timestamp: Date): Promise<Uint8Array | undefined> => {
      const storage = memoryStorage(exampleProject());
      await buildProject(storage, { outDir: 'build', timestamp });
      return storage.written.get('build/documents/introduction.docx');
    };
    const first = await build(TIMESTAMP);
    const second = await build(TIMESTAMP);
    const other = await build(new Date('2027-01-01T00:00:00Z'));
    expect(Buffer.from(first ?? []).equals(Buffer.from(second ?? []))).toBe(true);
    expect(Buffer.from(first ?? []).equals(Buffer.from(other ?? []))).toBe(false);
  });

  it('fills in the defaults of the project', async () => {
    const storage = memoryStorage(exampleProject());
    await buildProject(storage, options);
    const creator = (path: string): string => {
      const files = unzipSync(storage.written.get(path) ?? new Uint8Array());
      return (
        /<dc:creator>(.*?)<\/dc:creator>/.exec(
          strFromU8(files['docProps/core.xml'] ?? new Uint8Array()),
        )?.[1] ?? ''
      );
    };
    // The introduction has no authors, the reference has its own.
    expect(creator('build/documents/introduction.docx')).toBe('Example Author');
    expect(creator('build/documents/reference.docx')).toBe('A. Writer');
  });

  it('uses the default page template of the project, unless a document selects another', async () => {
    const files = exampleProject();
    files['phrase.yaml'] = (files['phrase.yaml'] ?? '').replace(
      "  classification: 'Internal'",
      "  classification: 'Internal'\n  page-template: 'page-letter'",
    );
    files['documents/reference.phrase.md'] = (files['documents/reference.phrase.md'] ?? '').replace(
      'document-number: "EX-002"',
      'document-number: "EX-002"\npage-template: "page"',
    );
    const storage = memoryStorage(files);
    const result = await buildProject(storage, options);
    expect(result.diagnostics).toEqual([]);
    const pageSize = (path: string): string => {
      const parts = unzipSync(storage.written.get(path) ?? new Uint8Array());
      return (
        /<w:pgSz w:w="(\d+)"/.exec(
          strFromU8(parts['word/document.xml'] ?? new Uint8Array()),
        )?.[1] ?? ''
      );
    };
    expect(pageSize('build/documents/introduction.docx')).toBe('12240');
    expect(pageSize('build/documents/reference.docx')).toBe('11906');
  });

  it('writes nothing when a document has an error', async () => {
    const files = {
      ...exampleProject(),
      'documents/bad.phrase.md':
        '---\nphrase-format: 1\ndocument-number: "N"\n---\n\n<!-- phrase: .missing -->\nText\n',
    };
    const storage = memoryStorage(files);
    const result = await buildProject(storage, options);
    expect(result.written).toEqual([]);
    expect(storage.written.size).toBe(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ file: 'documents/bad.phrase.md', code: 'unknown-style' }),
    ]);
  });

  it('writes nothing when the project file has an error', async () => {
    const storage = memoryStorage({ ...exampleProject(), 'phrase.yaml': 'phrase-format: 1\n' });
    const result = await buildProject(storage, options);
    expect(result.written).toEqual([]);
    expect(result.documents).toBe(0);
    expect(storage.written.size).toBe(0);
  });

  it('reports each problem once, although the exporter checks the document again', async () => {
    const files = {
      ...exampleProject(),
      'documents/heading.phrase.md':
        '---\nphrase-format: 1\ndocument-number: "N"\n---\n\n# No ID\n',
    };
    const result = await buildProject(memoryStorage(files), options);
    expect(result.written).toHaveLength(3);
    expect(
      result.diagnostics.filter(
        (d) => d.code === 'missing-id' && d.file === 'documents/heading.phrase.md',
      ),
    ).toHaveLength(1);
  });

  it.each(['../out', '/out', 'a\\b', ''])('rejects the output directory "%s"', async (outDir) => {
    const storage = memoryStorage(exampleProject());
    const result = await buildProject(storage, { outDir, timestamp: TIMESTAMP });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-output-directory' }),
    ]);
    expect(storage.reads).toEqual([]);
    expect(storage.written.size).toBe(0);
  });
});
