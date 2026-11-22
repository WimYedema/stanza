import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { contentHash, type SourceStamp } from '@stanza/core';
import { parseDocument, parseStylesheet } from '@stanza/format';
import { exportDocx } from './export.js';

const stylesheet = parseStylesheet(
  readFileSync(
    new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
    'utf8',
  ),
).stylesheet;

const TIMESTAMP = new Date('2026-03-04T05:06:07Z');
const SOURCE =
  '---\r\nstanza-format: 1\r\n---\r\n\r\n<!-- stanza: #k7m2q9x4zb -->\r\n# Tom & Jerry <3\r\n\r\nText.\r\n';
const COMMIT = '5f7f366e19d69c26fd4fda1e2fc08e0747b883b1';

async function exported(source?: SourceStamp) {
  const parsed = parseDocument(SOURCE);
  expect(parsed.diagnostics).toEqual([]);
  const result = await exportDocx(parsed.document, stylesheet, {
    timestamp: TIMESTAMP,
    ...(source !== undefined ? { source } : {}),
  });
  if (result.bytes === undefined) throw new Error(JSON.stringify(result.diagnostics));
  const files = unzipSync(result.bytes);
  return {
    bytes: result.bytes,
    names: Object.keys(files),
    part: (path: string): string => strFromU8(files[path] ?? new Uint8Array()),
  };
}

/** The custom file properties of a package, by name. */
function properties(xml: string): Record<string, string> {
  return Object.fromEntries(
    [...xml.matchAll(/name="([^"]+)"><vt:lpwstr>([^<]*)<\/vt:lpwstr>/g)].map(
      (m): [string, string] => [m[1] ?? '', m[2] ?? ''],
    ),
  );
}

describe('the revision stamp (ADR 0084)', () => {
  const stamp: SourceStamp = {
    path: 'documents/tom.stanza.md',
    text: SOURCE,
    revision: { commit: COMMIT, dirty: false },
  };

  it('writes the document, commit, dirty flag and content hash as custom file properties', async () => {
    const { part } = await exported(stamp);
    expect(properties(part('docProps/custom.xml'))).toEqual({
      'stanza-document': 'documents/tom.stanza.md',
      'stanza-commit': COMMIT,
      'stanza-dirty': 'false',
      'stanza-content-hash': contentHash(SOURCE),
    });
  });

  it('leaves the commit and the dirty flag out when the host knows no revision', async () => {
    const { part } = await exported({ path: stamp.path, text: SOURCE });
    expect(Object.keys(properties(part('docProps/custom.xml')))).toEqual([
      'stanza-document',
      'stanza-content-hash',
    ]);
  });

  it('embeds the source, with normalised line endings, as a custom XML part of the document', async () => {
    const { part } = await exported(stamp);
    const item = part('customXml/item1.xml');
    expect(item).toContain('<source xmlns="urn:stanza:source:1" path="documents/tom.stanza.md"');
    expect(item).toContain(`hash="${contentHash(SOURCE)}"`);
    const text = /<source [^>]*>([\s\S]*)<\/source>/.exec(item)?.[1] ?? '';
    const decoded = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    expect(decoded).toBe(SOURCE.replace(/\r\n/g, '\n'));

    expect(part('customXml/itemProps1.xml')).toContain('ds:uri="urn:stanza:source:1"');
    expect(part('customXml/_rels/item1.xml.rels')).toContain('Target="itemProps1.xml"');
    expect(part('word/_rels/document.xml.rels')).toMatch(
      /<Relationship Id="rId\d+" Type="[^"]*\/relationships\/customXml" Target="..\/customXml\/item1.xml"\/>/,
    );
    expect(part('[Content_Types].xml')).toContain('PartName="/customXml/itemProps1.xml"');
  });

  it('gives the same bytes for the same source and revision', async () => {
    const first = await exported(stamp);
    const second = await exported(stamp);
    expect(second.bytes).toEqual(first.bytes);
  });

  it('adds nothing without a stamp', async () => {
    const { names, part } = await exported();
    expect(names.filter((name) => name.startsWith('customXml/'))).toEqual([]);
    expect(part('docProps/custom.xml')).not.toContain('stanza-');
  });
});
