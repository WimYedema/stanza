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
    expect(exampleNames()).toEqual([
      'classic-cover',
      'corporate-report',
      'plain-memo',
      'technical-note',
    ]);
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
    ['technical-note', 'build/documents/cache-design.docx'],
  ])('%s has a cover of rows with its image', async (name, path) => {
    const { written } = await buildExample(name);
    const files = unzipSync(written.get(path) ?? new Uint8Array());
    const document = strFromU8(files['word/document.xml'] ?? new Uint8Array());
    const cover = document.slice(0, document.indexOf('<w:sectPr'));
    expect(cover).toContain('w:hRule="exact"');
    expect(cover).toContain('<wp:docPr id="1"');
    expect(Object.keys(files).filter((file) => file.startsWith('word/media/'))).toHaveLength(1);
  });

  it('plain-memo has a title block before its text, and no cover', async () => {
    const { written } = await buildExample('plain-memo');
    const files = unzipSync(written.get('build/documents/release-plan.docx') ?? new Uint8Array());
    const document = strFromU8(files['word/document.xml'] ?? new Uint8Array());
    expect(document.match(/<w:sectPr/g)).toHaveLength(1);
    const logo = document.indexOf('<wp:docPr id="1"');
    const title = document.indexOf('<w:pStyle w:val="TitleMain"/>');
    const text = document.indexOf('This example has no cover.');
    expect(logo).toBeGreaterThan(0);
    expect(logo).toBeLessThan(title);
    expect(title).toBeLessThan(text);
  });
});
