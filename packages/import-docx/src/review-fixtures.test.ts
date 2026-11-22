import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentHash } from '@stanza/core';
import { readReview, type ReviewReading } from './review.js';

/** Real files from the review spike (item 203), with the reviewer anonymised; see their README. */
const fixture = (name: string): Uint8Array =>
  readFileSync(new URL(`../fixtures/review-round-trip/${name}`, import.meta.url));
const SOURCE = readFileSync(
  new URL('../fixtures/review-round-trip/0002-host-and-dependencies.stanza.md', import.meta.url),
  'utf8',
);

function review(name: string): ReviewReading {
  const read = readReview(fixture(name));
  if (!read.ok) throw new Error(read.message);
  return read.review;
}

const TITLE = '6jps6cyntz';
const CONTEXT = 'b2qjj8ze19';
const HOST = 'vkpazyqv7x';
const PACKAGES_TABLE = 'x6gmjy7p23';

describe('readReview on files reviewed in Word', () => {
  it('reads every bookmark that Word desktop and Word for the web kept', () => {
    for (const name of [
      'desktop-protected.docx',
      'web-unprotected.docx',
      'desktop-replies-resolved-reaction.docx',
      'web-replies-resolved-reaction.docx',
    ]) {
      expect(review(name).bookmarks).toHaveLength(12);
    }
  });

  it('identifies comments by durable ID and times them in UTC, in both forms Word writes', () => {
    // Word desktop: `w:date` is local time marked `Z`; the UTC time is an hour earlier here.
    const desktop = review('desktop-protected.docx').comments[0];
    expect(desktop).toMatchObject({ id: '1', durableId: '2E3C8848', dateIsUtc: true });
    expect(desktop?.date).toBe('2026-11-21T15:05:00Z');
    // Word for the web: random `w:id`, milliseconds.
    const web = review('web-unprotected.docx').comments[0];
    expect(web).toMatchObject({ durableId: '78989E62', date: '2026-11-21T15:25:59.913Z' });
  });

  it('places comments on a heading, across sections, in a list and in a table cell', () => {
    const [title, across, list, cell] = review('desktop-protected.docx').comments;
    expect(title).toMatchObject({ placement: 'inside', block: TITLE, quote: 'ADR' });
    // A selection that starts in text without an ID goes to the first block with an ID inside it.
    expect(across).toMatchObject({ placement: 'inside', block: CONTEXT });
    expect(across?.blocks).toContain(HOST);
    expect(across?.quote.startsWith('Status: Accepted.')).toBe(true);
    // The quote is the selection as Word kept it, trailing space and all.
    expect(list).toMatchObject({ placement: 'after', block: HOST, quote: 'browser ' });
    expect(cell).toMatchObject({
      placement: 'after',
      block: PACKAGES_TABLE,
      quote: 'DOCX adapter',
    });
  });

  it('links replies to their comment, and reads resolved comments and reactions', () => {
    const comments = review('web-replies-resolved-reaction.docx').comments;
    const byText = (text: string) => comments.find((c) => c.text === text);
    expect(byText('Replying')?.replyTo).toBe(byText('Comment in heading')?.durableId);
    expect(byText('Responding')?.replyTo).toBe(byText('Comment on several sections')?.durableId);
    expect(byText('Comment in a list')?.resolved).toBe(true);
    expect(byText('Comment in a table')?.resolved).toBe(true);
    expect(byText('Comment in heading')?.resolved).toBe(false);
    expect(byText('Comment in heading')?.reactions).toEqual([{ type: 1, name: 'Ada Reviewer' }]);
    // A reply has reactions of its own.
    expect(byText('Responding')?.reactions).toEqual([{ type: 1, name: 'Ada Reviewer' }]);
  });

  it('keeps a mention as its display name, never the address', () => {
    const mention = review('web-unprotected.docx').comments.find((c) => c.text.startsWith('@'));
    expect(mention?.text).toBe('@Ada Reviewer');
    expect(JSON.stringify(mention)).not.toContain('mailto');
    expect(JSON.stringify(mention)).not.toContain('example.com');
  });

  it('gives no stamp or source for a file exported before item 138', () => {
    const old = review('desktop-protected.docx');
    expect(old.stamp).toBeUndefined();
    expect(old.source).toBeUndefined();
    expect(old.savedAt).toBe('2026-11-21T15:07:00Z');
  });

  it('reads the stamp and the embedded source, with the line endings Word desktop changed', () => {
    const stamped = review('stamped-desktop-then-web.docx');
    expect(stamped.stamp).toEqual({
      document: 'documents/0002-host-and-dependencies.stanza.md',
      commit: '5f7f366e19d69c26fd4fda1e2fc08e0747b883b1',
      dirty: false,
      contentHash: contentHash(SOURCE),
    });
    expect(stamped.source?.text).toBe(SOURCE);
    expect(stamped.source?.hash).toBe(contentHash(SOURCE));
    expect(stamped.comments.map((c) => c.author)).toEqual(['Ada Reviewer', 'Ada Reviewer']);
  });
});
