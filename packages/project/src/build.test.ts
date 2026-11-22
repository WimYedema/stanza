import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProject, outputPath } from './build.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const TIMESTAMP = new Date('2026-03-04T05:06:07Z');
const options = { outDir: 'build', timestamp: TIMESTAMP };

describe('outputPath', () => {
  it('mirrors the document path under the output directory', () => {
    expect(outputPath('build', 'documents/a.stanza.md')).toBe('build/documents/a.docx');
    expect(outputPath('out/x', 'b.stanza.md')).toBe('out/x/b.docx');
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
      '---\nstanza-format: 1\ntitle: "Notes"\ndocument-number: "N-2"\n---\n\nSee [the introduction](#k7m2q9x4zb).\n';
    const relsOf = (storage: ReturnType<typeof memoryStorage>, path: string): string =>
      strFromU8(
        unzipSync(storage.written.get(path) ?? new Uint8Array())['word/_rels/document.xml.rels'] ??
          new Uint8Array(),
      );

    it('exports filename hints by definitive ID and file-only links as DOCX paths without modifying source', async () => {
      const source =
        NOTES.replace('#k7m2q9x4zb', 'stale.stanza.md#k7m2q9x4zb') +
        '\nSee [reference](documents/reference.stanza.md).\n';
      const storage = memoryStorage({ ...exampleProject(), 'notes.stanza.md': source });
      const result = await buildProject(storage, options);
      expect(result.diagnostics.map((d) => d.code)).toEqual(['stale-reference-path']);
      expect(relsOf(storage, 'build/notes.docx')).toContain('Target="documents/introduction.docx"');
      expect(relsOf(storage, 'build/notes.docx')).toContain('Target="documents/reference.docx"');
      expect(relsOf(storage, 'build/notes.docx')).not.toContain('.stanza.md');
      expect(storage.texts.size).toBe(0);
    });

    it('becomes a link to the file of that document', async () => {
      const storage = memoryStorage({ ...exampleProject(), 'notes.stanza.md': NOTES });
      const result = await buildProject(storage, options);
      expect(result.diagnostics).toEqual([]);
      expect(relsOf(storage, 'build/notes.docx')).toContain(
        'Target="documents/introduction.docx" TargetMode="External"',
      );
    });

    it('is written with a warning when that document is not built', async () => {
      const files: Record<string, string> = { ...exampleProject(), 'notes.stanza.md': NOTES };
      files['stanza.yaml'] = `${files['stanza.yaml'] ?? ''}documents:\n  - notes.stanza.md\n`;
      const storage = memoryStorage(files);
      const result = await buildProject(storage, options);
      expect(result.written).toEqual(['build/notes.docx']);
      expect(result.diagnostics.map((d) => [d.file, d.code])).toEqual([
        ['documents/introduction.stanza.md', 'unlisted-document'],
        ['documents/reference.stanza.md', 'unlisted-document'],
        ['notes.stanza.md', 'reference-to-unbuilt-document'],
      ]);
    });

    it('stops the build when the block is gone', async () => {
      const files = {
        ...exampleProject(),
        'notes.stanza.md': NOTES.replace('k7m2q9x4zb', 'zzzzzzzzzz'),
      };
      const result = await buildProject(memoryStorage(files), options);
      expect(result.written).toEqual([]);
      expect(result.diagnostics.map((d) => d.code)).toContain('broken-reference');
    });
  });

  it('builds only the documents of the list, and says that the others are not built', async () => {
    const files = exampleProject();
    files['stanza.yaml'] =
      `${files['stanza.yaml'] ?? ''}documents:\n  - documents/reference.stanza.md\n`;
    const storage = memoryStorage(files);
    const result = await buildProject(storage, options);
    expect(result.documents).toBe(1);
    expect(result.written).toEqual(['build/documents/reference.docx']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        file: 'documents/introduction.stanza.md',
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
    files['stanza.yaml'] = (files['stanza.yaml'] ?? '').replace(
      "  classification: 'Internal'",
      "  classification: 'Internal'\n  page-template: 'page-letter'",
    );
    files['documents/reference.stanza.md'] = (files['documents/reference.stanza.md'] ?? '').replace(
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
      'documents/bad.stanza.md':
        '---\nstanza-format: 1\ndocument-number: "N"\n---\n\n<!-- stanza: .missing -->\nText\n',
    };
    const storage = memoryStorage(files);
    const result = await buildProject(storage, options);
    expect(result.written).toEqual([]);
    expect(storage.written.size).toBe(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ file: 'documents/bad.stanza.md', code: 'unknown-style' }),
    ]);
  });

  it('writes nothing when the project file has an error', async () => {
    const storage = memoryStorage({ ...exampleProject(), 'stanza.yaml': 'stanza-format: 1\n' });
    const result = await buildProject(storage, options);
    expect(result.written).toEqual([]);
    expect(result.documents).toBe(0);
    expect(storage.written.size).toBe(0);
  });

  it('reports each problem once, although the exporter checks the document again', async () => {
    const files = {
      ...exampleProject(),
      'documents/heading.stanza.md':
        '---\nstanza-format: 1\ndocument-number: "N"\n---\n\n# No ID\n',
    };
    const result = await buildProject(memoryStorage(files), options);
    expect(result.written).toHaveLength(3);
    expect(
      result.diagnostics.filter(
        (d) => d.code === 'missing-id' && d.file === 'documents/heading.stanza.md',
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

describe('the revision stamp (ADR 0084)', () => {
  const propertiesOf = (bytes: Uint8Array | undefined): Record<string, string> => {
    const xml = strFromU8(
      unzipSync(bytes ?? new Uint8Array())['docProps/custom.xml'] ?? new Uint8Array(),
    );
    return Object.fromEntries(
      [...xml.matchAll(/name="([^"]+)"><vt:lpwstr>([^<]*)</g)].map((m): [string, string] => [
        m[1] ?? '',
        m[2] ?? '',
      ]),
    );
  };
  const introduction = 'build/documents/introduction.docx';

  it('stamps each package with its document and the revision the host gives', async () => {
    const storage = memoryStorage(exampleProject());
    const asked: string[][] = [];
    await buildProject(storage, {
      ...options,
      revisions: (paths) => {
        asked.push([...paths]);
        return Promise.resolve(
          new Map([['documents/introduction.stanza.md', { commit: 'abc123', dirty: true }]]),
        );
      },
    });
    expect(asked).toEqual([['documents/introduction.stanza.md', 'documents/reference.stanza.md']]);
    expect(propertiesOf(storage.written.get(introduction))).toMatchObject({
      'stanza-document': 'documents/introduction.stanza.md',
      'stanza-commit': 'abc123',
      'stanza-dirty': 'true',
    });
    expect(propertiesOf(storage.written.get('build/documents/reference.docx'))).not.toHaveProperty(
      'stanza-commit',
    );
  });

  it('still builds when the host cannot tell the revisions', async () => {
    const storage = memoryStorage(exampleProject());
    const result = await buildProject(storage, {
      ...options,
      revisions: () => Promise.reject(new Error('git not found')),
    });
    expect(result.written).toHaveLength(2);
    expect(propertiesOf(storage.written.get(introduction))).not.toHaveProperty('stanza-commit');
    expect(propertiesOf(storage.written.get(introduction))).toHaveProperty('stanza-content-hash');
  });
});

describe('buildProject, a file that cannot be written', () => {
  it('reports a file that is open in Word, and still writes the others', async () => {
    const storage = memoryStorage(exampleProject());
    const locked = 'build/documents/introduction.docx';
    const writeFile = storage.writeFile.bind(storage);
    storage.writeFile = (path, content) =>
      path === locked
        ? Promise.reject(
            Object.assign(new Error(`EBUSY: resource busy or locked, open '${path}'`), {
              code: 'EBUSY',
            }),
          )
        : writeFile(path, content);
    const result = await buildProject(storage, options);
    expect(result.written).toEqual(['build/documents/reference.docx']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        file: locked,
        severity: 'error',
        code: 'output-not-written',
        message: expect.stringContaining('open in another program, such as Word') as string,
      }),
    ]);
  });
});

describe('buildProject, the protection of the packages (ADR 0085)', () => {
  const settingsOf = (bytes: Uint8Array | undefined): string =>
    strFromU8(unzipSync(bytes ?? new Uint8Array())['word/settings.xml'] ?? new Uint8Array());
  const introduction = 'build/documents/introduction.docx';

  it('protects for comments by default, and follows review-protection in the project file', async () => {
    const protectedStorage = memoryStorage(exampleProject());
    await buildProject(protectedStorage, options);
    expect(settingsOf(protectedStorage.written.get(introduction))).toContain('documentProtection');

    const files = exampleProject();
    files['stanza.yaml'] = `${files['stanza.yaml'] ?? ''}review-protection: none\n`;
    const open = memoryStorage(files);
    await buildProject(open, options);
    expect(settingsOf(open.written.get(introduction))).not.toContain('documentProtection');
  });

  it('takes the protection of the build in place of the project file', async () => {
    const storage = memoryStorage(exampleProject());
    await buildProject(storage, { ...options, protection: 'none' });
    expect(settingsOf(storage.written.get(introduction))).not.toContain('documentProtection');
  });
});
