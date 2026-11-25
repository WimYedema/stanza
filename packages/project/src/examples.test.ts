import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProject } from './build.js';
import {
  diskProject,
  exampleDirectory,
  exampleNames,
  memoryStorage,
} from './memory-storage.testing.js';

const options = { outDir: 'build', timestamp: new Date('2026-03-04T05:06:07Z') };

async function buildExample(name: string) {
  const { files, binary } = diskProject(exampleDirectory(name));
  const storage = memoryStorage(files, [], binary);
  const result = await buildProject(storage, options);
  return { result, written: storage.written };
}

/**
 * The projects in `examples/` show what Stanza can do and are built as they are, so a change that
 * breaks one of them fails here.
 */
describe('the example projects', () => {
  it('are there', () => {
    expect(exampleNames()).toEqual(['classic-cover', 'corporate-report', 'plain-memo']);
  });

  it.each(exampleNames())(
    '%s builds without findings, to the same bytes each time',
    async (name) => {
      const first = await buildExample(name);
      expect(first.result.diagnostics).toEqual([]);
      expect(first.result.written.length).toBeGreaterThan(0);
      const second = await buildExample(name);
      for (const path of first.result.written) {
        expect(second.written.get(path)).toEqual(first.written.get(path));
      }
    },
  );

  it.each([
    ['corporate-report', 'build/documents/annual-review.docx'],
    ['classic-cover', 'build/documents/field-guide.docx'],
  ])('%s has a cover of rows with its image', async (name, path) => {
    const { written } = await buildExample(name);
    const files = unzipSync(written.get(path) ?? new Uint8Array());
    const document = strFromU8(files['word/document.xml'] ?? new Uint8Array());
    const cover = document.slice(0, document.indexOf('<w:sectPr'));
    expect(cover).toContain('w:hRule="exact"');
    expect(cover).toContain('<wp:docPr id="1"');
    expect(Object.keys(files).filter((file) => file.startsWith('word/media/'))).toHaveLength(1);
  });
});
