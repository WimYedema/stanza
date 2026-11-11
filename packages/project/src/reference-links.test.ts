import { describe, expect, it } from 'vitest';
import { parseDocument } from '@phrase/format';
import type { LoadedDocument } from './load.js';
import { docxLink, referenceTargets } from './reference-links.js';

describe('docxLink', () => {
  it.each([
    ['documents/a.phrase.md', 'documents/b.phrase.md', 'b.docx'],
    ['documents/a.phrase.md', 'other/b.phrase.md', '../other/b.docx'],
    ['a.phrase.md', 'documents/deep/b.phrase.md', 'documents/deep/b.docx'],
    ['documents/deep/a.phrase.md', 'b.phrase.md', '../../b.docx'],
    ['documents/x/a.phrase.md', 'documents/y/b.phrase.md', '../y/b.docx'],
    ['a.phrase.md', 'b.phrase.md', 'b.docx'],
    ['documents/a.phrase.md', 'documents/my notes.phrase.md', 'my%20notes.docx'],
  ])('goes from %s to %s as %s', (from, to, expected) => {
    expect(docxLink(from, to)).toBe(expected);
  });
});

describe('referenceTargets', () => {
  const doc = (path: string, id: string, listed = true): LoadedDocument => ({
    path,
    document: parseDocument(`---\nphrase-format: 1\n---\n\n<!-- phrase: #${id} -->\n# Title\n`)
      .document,
    listed,
  });
  const documents = [
    doc('documents/a.phrase.md', 'aaaaaaaaaa'),
    doc('other/b.phrase.md', 'bbbbbbbbbb'),
    doc('notes.phrase.md', 'cccccccccc', false),
  ];
  const targetsOf = referenceTargets(documents);

  it('gives the blocks of the other documents with the file of their document', () => {
    expect([...targetsOf('documents/a.phrase.md')]).toEqual([
      ['bbbbbbbbbb', { href: '../other/b.docx', built: true }],
      ['cccccccccc', { href: '../notes.docx', built: false }],
    ]);
  });

  it('leaves out the blocks of the document itself, which link inside it', () => {
    expect([...targetsOf('other/b.phrase.md').keys()]).toEqual(['aaaaaaaaaa', 'cccccccccc']);
  });
});
