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
const index = indexProjectReferences([{ file: 'new/target file.phrase.md', document: target }]);

describe('reference location hints', () => {
  it('resolves encoded relative paths, including parent directories, but never escapes the project', () => {
    expect(parseReferenceLink('../new/target%20file.phrase.md#aaaaaaaaaa')).toEqual({
      file: '../new/target%20file.phrase.md',
      target: ID,
    });
    expect(referenceFile('old/source.phrase.md', '../new/target%20file.phrase.md')).toBe(
      'new/target file.phrase.md',
    );
    expect(relativeReferenceFile('old/source.phrase.md', 'new/target file.phrase.md')).toBe(
      '../new/target%20file.phrase.md',
    );
    for (const hint of [
      '../../outside.phrase.md',
      '/outside.phrase.md',
      '%2foutside.phrase.md',
      '%ZZ.phrase.md',
      '..%5coutside.phrase.md',
    ]) {
      expect(referenceFile('old/source.phrase.md', hint)).toBeUndefined();
    }
    expect(parseReferenceLink('https://example.org/a.phrase.md#aaaaaaaaaa')).toBeUndefined();
  });

  it('warns about a stale filename and explicitly fixes only that hint, preserving identity and label', () => {
    const document = source('missing.phrase.md#aaaaaaaaaa');
    const diagnostics = checkReferencePaths(
      document,
      'old/source.phrase.md',
      new Set(['new/target file.phrase.md']),
      index,
    );
    expect(diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: 'stale-reference-path',
        fix: {
          kind: 'reference-path',
          href: 'missing.phrase.md#aaaaaaaaaa',
          replacement: '../new/target%20file.phrase.md#aaaaaaaaaa',
        },
      },
    ]);
    const fixed = fixReferencePaths(document, 'old/source.phrase.md', index);
    expect(fixed).toEqual(source('../new/target%20file.phrase.md#aaaaaaaaaa'));
    expect(fixReferencePaths(fixed, 'old/source.phrase.md', index)).toEqual(fixed);
    expect(document).toEqual(source('missing.phrase.md#aaaaaaaaaa'));
  });

  it('keeps ID-only links unchanged and reports missing file-only destinations', () => {
    expect(fixReferencePaths(source('#aaaaaaaaaa'), 'source.phrase.md', index)).toEqual(
      source('#aaaaaaaaaa'),
    );
    expect(
      checkReferencePaths(source('gone.phrase.md'), 'source.phrase.md', new Set(), index),
    ).toMatchObject([{ code: 'missing-linked-document', severity: 'error' }]);
  });

  it('does not resolve or fix an ambiguous ID', () => {
    const ambiguous = indexProjectReferences([
      { file: 'one.phrase.md', document: target },
      { file: 'two.phrase.md', document: target },
    ]);
    expect(resolveProjectReference(ambiguous, ID)).toBeUndefined();
    const document = source('old.phrase.md#aaaaaaaaaa');
    expect(fixReferencePaths(document, 'source.phrase.md', ambiguous)).toEqual(document);
  });
});
