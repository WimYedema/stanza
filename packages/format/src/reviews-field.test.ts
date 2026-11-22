import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse.js';
import { serializeDocument } from './serialize.js';

const REVIEW = `---
stanza-format: 1
title: "Review of A"
reviews: "documents/a.stanza.md"
---

<!-- stanza: #k7m2q9x4zb -->
# Review of A
`;

describe('the reviews field (ADR 0084)', () => {
  it('is read into the metadata and written back after the other built-in fields', () => {
    const parsed = parseDocument(REVIEW);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.document.meta.reviews).toBe('documents/a.stanza.md');
    expect(parsed.document.meta.fields).toEqual({});
    expect(serializeDocument(parsed.document)).toBe(REVIEW);
  });

  it('must be a string', () => {
    const parsed = parseDocument(REVIEW.replace('reviews: "documents/a.stanza.md"', 'reviews: []'));
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(['front-matter-invalid']);
  });
});
