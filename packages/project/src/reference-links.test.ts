import { describe, expect, it } from 'vitest';
import { parseDocument } from '@stanza/format';
import type { LoadedDocument } from './load.js';
import { docxLink, referenceTargets } from './reference-links.js';

describe('docxLink', () => {
  it.each([
    ['documents/a.stanza.md', 'documents/b.stanza.md', 'b.docx'],
    ['documents/a.stanza.md', 'other/b.stanza.md', '../other/b.docx'],
    ['a.stanza.md', 'documents/deep/b.stanza.md', 'documents/deep/b.docx'],
    ['documents/deep/a.stanza.md', 'b.stanza.md', '../../b.docx'],
    ['documents/x/a.stanza.md', 'documents/y/b.stanza.md', '../y/b.docx'],
    ['a.stanza.md', 'b.stanza.md', 'b.docx'],
    ['documents/a.stanza.md', 'documents/my notes.stanza.md', 'my%20notes.docx'],
  ])('goes from %s to %s as %s', (from, to, expected) => {
    expect(docxLink(from, to)).toBe(expected);
  });
});

describe('referenceTargets', () => {
  const doc = (path: string, id: string, listed = true): LoadedDocument => ({
    path,
    document: parseDocument(`---\nstanza-format: 1\n---\n\n<!-- stanza: #${id} -->\n# Title\n`)
      .document,
    listed,
  });
  const documents = [
    doc('documents/a.stanza.md', 'aaaaaaaaaa'),
    doc('other/b.stanza.md', 'bbbbbbbbbb'),
    doc('notes.stanza.md', 'cccccccccc', false),
  ];
  const targetsOf = referenceTargets(documents);

  it('gives the blocks of the other documents with the file of their document', () => {
    expect([...targetsOf('documents/a.stanza.md')]).toEqual([
      ['bbbbbbbbbb', { href: '../other/b.docx', built: true }],
      ['cccccccccc', { href: '../notes.docx', built: false }],
    ]);
  });

  it('leaves out the blocks of the document itself, which link inside it', () => {
    expect([...targetsOf('other/b.stanza.md').keys()]).toEqual(['aaaaaaaaaa', 'cccccccccc']);
  });
});
