import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseStylesheet } from '@stanza/format';
import { buildProject } from './build.js';
import { importCover } from './import-cover.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';

const options = { outDir: 'build', timestamp: new Date('2026-03-04T05:06:07Z') };

/**
 * A small template: a title placeholder in a style with a color, a field, and a page break. The
 * import itself is tested in `import-docx` with a template like a corporate one.
 */
function template(): Uint8Array {
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const document =
    `<w:document xmlns:w="${w}"><w:body>` +
    '<w:p><w:pPr><w:pStyle w:val="Cover"/></w:pPr><w:r><w:t>[Document title]</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Number: [Document number]</w:t></w:r></w:p>' +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    '<w:p><w:r><w:t>Body.</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/>' +
    '</w:sectPr></w:body></w:document>';
  const styles =
    `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Cover">` +
    '<w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="40"/><w:color w:val="1F4E79"/></w:rPr>' +
    '</w:style></w:styles>';
  const rels =
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  return zipSync({
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'word/_rels/document.xml.rels': strToU8(rels),
  });
}

describe('importCover (ADR 0094)', () => {
  it('adds a page template with its cover, styles and tokens, which a document can use', async () => {
    const files = exampleProject();
    const storage = memoryStorage(files);
    const imported = await importCover(storage, template(), { fileName: 'Report Template' });
    if (!imported.ok) throw new Error(imported.message);
    expect(imported.template).toBe('report-template');
    expect(imported.written).toEqual(['styles/default.yaml']);
    expect(imported.result.fields).toEqual(['document-number']);
    const text = storage.texts.get('styles/default.yaml') ?? '';
    const parsed = parseStylesheet(text);
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const page = parsed.stylesheet.pageTemplates.get('report-template' as never);
    expect(page?.cover?.kind).toBe('grid');
    expect(text).toContain('  report-template-cover:\n');
    expect(text).toContain("    report-template-color-1: '#1F4E79'\n");
    // Every line of the stylesheet as it was is still there, in its order: the import only adds.
    const edited = text.split('\n');
    let at = 0;
    for (const line of (files['styles/default.yaml'] ?? '').split('\n')) {
      at = edited.indexOf(line, at);
      expect(at).toBeGreaterThanOrEqual(0);
      at += 1;
    }

    // A document of the project that selects the template is built with the cover.
    const document = files['documents/introduction.stanza.md'] ?? '';
    const built = memoryStorage({
      ...files,
      'styles/default.yaml': text,
      'documents/introduction.stanza.md': document.replace(
        'title: "Introduction"',
        'title: "Introduction"\npage-template: "report-template"',
      ),
    });
    const result = await buildProject(built, options);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.written).toContain('build/documents/introduction.docx');
  });

  it('refuses a name that the stylesheet has, and changes nothing', async () => {
    const storage = memoryStorage(exampleProject());
    const imported = await importCover(storage, template(), { fileName: 'x', name: 'page' });
    expect(!imported.ok && imported.message).toContain('page template "page" already');
    expect(storage.written.size).toBe(0);
    expect(storage.texts.size).toBe(0);
  });

  it('refuses a file that is not a Word file', async () => {
    const storage = memoryStorage(exampleProject());
    const imported = await importCover(storage, new Uint8Array([1, 2, 3]), { fileName: 'bad' });
    expect(imported.ok).toBe(false);
    expect(storage.texts.size).toBe(0);
  });
});
