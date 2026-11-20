import { describe, expect, it } from 'vitest';
import type { Document } from './document.js';
import { isNodeId } from './ids.js';
import {
  checkReferencePaths,
  fixReferencePaths,
  indexProjectReferences,
  resolveProjectReference,
} from './project-references.js';
import { parseReferenceLink, referenceFile, relativeReferenceFile } from './reference-links.js';

const ID = 'aaaaaaaaaa';
if (!isNodeId(ID)) throw new Error('Invalid test ID.');
const target: Document = {
  meta: { fields: {} },
  blocks: [{ type: 'heading', id: ID, level: 1, content: [] }],
};
const source = (href: string): Document => ({
  meta: { fields: {} },
  blocks: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'See target', marks: [{ type: 'link', href }] }],
    },
  ],
});
const index = indexProjectReferences([{ file: 'new/target file.stanza.md', document: target }]);

describe('reference location hints', () => {
  it('resolves encoded relative paths, including parent directories, but never escapes the project', () => {
    expect(parseReferenceLink('../new/target%20file.stanza.md#aaaaaaaaaa')).toEqual({
      file: '../new/target%20file.stanza.md',
      target: ID,
    });
    expect(referenceFile('old/source.stanza.md', '../new/target%20file.stanza.md')).toBe(
      'new/target file.stanza.md',
    );
    expect(relativeReferenceFile('old/source.stanza.md', 'new/target file.stanza.md')).toBe(
      '../new/target%20file.stanza.md',
    );
    for (const hint of [
      '../../outside.stanza.md',
      '/outside.stanza.md',
      '%2foutside.stanza.md',
      '%ZZ.stanza.md',
      '..%5coutside.stanza.md',
    ]) {
      expect(referenceFile('old/source.stanza.md', hint)).toBeUndefined();
    }
    expect(parseReferenceLink('https://example.org/a.stanza.md#aaaaaaaaaa')).toBeUndefined();
  });

  it('warns about a stale filename and explicitly fixes only that hint, preserving identity and label', () => {
    const document = source('missing.stanza.md#aaaaaaaaaa');
    const diagnostics = checkReferencePaths(
      document,
      'old/source.stanza.md',
      new Set(['new/target file.stanza.md']),
      index,
    );
    expect(diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: 'stale-reference-path',
        fix: {
          kind: 'reference-path',
          href: 'missing.stanza.md#aaaaaaaaaa',
          replacement: '../new/target%20file.stanza.md#aaaaaaaaaa',
        },
      },
    ]);
    const fixed = fixReferencePaths(document, 'old/source.stanza.md', index);
    expect(fixed).toEqual(source('../new/target%20file.stanza.md#aaaaaaaaaa'));
    expect(fixReferencePaths(fixed, 'old/source.stanza.md', index)).toEqual(fixed);
    expect(document).toEqual(source('missing.stanza.md#aaaaaaaaaa'));
  });

  it('keeps ID-only links unchanged and reports missing file-only destinations', () => {
    expect(fixReferencePaths(source('#aaaaaaaaaa'), 'source.stanza.md', index)).toEqual(
      source('#aaaaaaaaaa'),
    );
    expect(
      checkReferencePaths(source('gone.stanza.md'), 'source.stanza.md', new Set(), index),
    ).toMatchObject([{ code: 'missing-linked-document', severity: 'error' }]);
  });

  it('does not resolve or fix an ambiguous ID', () => {
    const ambiguous = indexProjectReferences([
      { file: 'one.stanza.md', document: target },
      { file: 'two.stanza.md', document: target },
    ]);
    expect(resolveProjectReference(ambiguous, ID)).toBeUndefined();
    const document = source('old.stanza.md#aaaaaaaaaa');
    expect(fixReferencePaths(document, 'source.stanza.md', ambiguous)).toEqual(document);
  });
});
