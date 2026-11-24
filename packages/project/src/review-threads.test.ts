import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@stanza/format';
import { memoryStorage } from './memory-storage.testing.js';
import { pullReview } from './review-pull.js';
import {
  latestThreads,
  positionOf,
  quoteOf,
  reviewThreads,
  threadStatusEdit,
  type ReviewThread,
} from './review-threads.js';

const FIXTURES = new URL('../../import-docx/fixtures/review-round-trip/', import.meta.url);
const SOURCE = readFileSync(new URL('0002-host-and-dependencies.stanza.md', FIXTURES), 'utf8');
const REVIEWED = 'documents/0002-host-and-dependencies.stanza.md';

let counter = 0;
/** A review document as `review pull` writes it for a fixture (ADR 0084). */
async function pulled(name: string): Promise<{ path: string; text: string }> {
  const storage = memoryStorage({
    'stanza.yaml': "stanza-format: 1\ntitle: 'Review test'\nstylesheet: 'styles/default.yaml'\n",
    'styles/default.yaml': readFileSync(
      new URL('../../../docs/styles/default.yaml', import.meta.url),
      'utf8',
    ),
    [REVIEWED]: SOURCE,
  });
  const result = await pullReview(storage, readFileSync(new URL(name, FIXTURES)), {
    fileName: name,
    randomBytes: () => Uint8Array.from({ length: 10 }, (_v, i) => (counter++ * 7 + i * 13) % 256),
  });
  if (!result.ok) throw new Error(result.message);
  return { path: result.document, text: storage.texts.get(result.document) ?? '' };
}

describe('reviewThreads (ADR 0086)', () => {
  it('reads back every thread that review pull wrote, with its anchor and hints', async () => {
    const { path, text } = await pulled('web-replies-resolved-reaction.docx');
    const threads = reviewThreads(path, parseDocument(text).document);
    expect(threads.map((t) => [t.title, t.anchor, t.status])).toEqual([
      ['Comment in heading', '6jps6cyntz', 'open'],
      ['Comment on several sections', 'b2qjj8ze19', 'open'],
      ['Comment in a list', 'vkpazyqv7x', 'resolved'],
      ['Comment in a table', 'x6gmjy7p23', 'resolved'],
      ['@Ada Reviewer', 'x6gmjy7p23', 'open'],
    ]);
    const [heading, across, list, cell, after] = threads;
    expect(heading?.review).toBe(path);
    expect(heading?.headingId).toBeDefined();
    expect(heading?.wordComment).toBe('78989E62');
    expect(heading?.comments).toEqual([
      {
        author: 'Ada Reviewer',
        time: '2026-11-21 15:25 UTC',
        text: 'Comment in heading',
        reactions: ['thumbs up (Ada Reviewer)'],
      },
      { author: 'Ada Reviewer', time: '2026-11-21 16:08 UTC', text: 'Replying', reactions: [] },
    ]);
    expect(across?.quote?.end).toBeDefined();
    expect(list).toMatchObject({
      position: { kind: 'under', paragraph: 4 },
      quote: { start: 'host' },
    });
    expect(cell).toMatchObject({
      position: { kind: 'cell', row: 2, column: 2 },
      quote: { start: 'Domain' },
    });
    expect(after).toMatchObject({
      position: { kind: 'after', paragraph: 1 },
      quote: { start: 'Node' },
    });
  });

  it('reads the notes of a change found in the file', async () => {
    const { path, text } = await pulled('stamped-desktop-then-web.docx');
    const threads = reviewThreads(path, parseDocument(text).document);
    expect(threads.every((t) => t.comments.length > 0)).toBe(true);
    const edited = `${text}\n<!-- stanza: #zzzzzzzzzz -->\n## Changed text\n\nUnder [Host](../${REVIEWED}#vkpazyqv7x).\n\nStatus: open. Changed in the file, not applied.\n\n**Was:** One.\n\n**Is now:** Two.\n`;
    const change = reviewThreads(path, parseDocument(edited).document).at(-1);
    expect(change).toMatchObject({ title: 'Changed text', anchor: 'vkpazyqv7x', status: 'open' });
    expect(change?.comments).toEqual([]);
    expect(change?.notes).toEqual(['Was: One.', 'Is now: Two.']);
  });

  it('keeps what it can read of a thread the author rewrote', () => {
    const text =
      '---\nstanza-format: 1\nreviews: "documents/a.stanza.md"\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n## Something\n\nI rewrote this sentence by hand.\n';
    expect(reviewThreads('reviews/a.stanza.md', parseDocument(text).document)).toEqual([
      {
        review: 'reviews/a.stanza.md',
        headingId: 'k7m2q9x4zb',
        title: 'Something',
        status: 'open',
        comments: [],
        notes: [],
      },
    ]);
  });
});

describe('threadStatusEdit (ADR 0086)', () => {
  const apply = (
    text: string,
    change: { line: number; start: number; end: number; text: string },
  ) =>
    text
      .split('\n')
      .map((line, i) =>
        i === change.line
          ? line.slice(0, change.start) + change.text + line.slice(change.end)
          : line,
      )
      .join('\n');

  it('changes only the word of the status, and back', async () => {
    const { path, text } = await pulled('web-replies-resolved-reaction.docx');
    const [first, second] = reviewThreads(path, parseDocument(text).document);
    if (first?.headingId === undefined || second?.headingId === undefined)
      throw new Error('no IDs');
    const change = threadStatusEdit(text, first.headingId, 'resolved');
    if (change === undefined) throw new Error('no change');
    const resolved = apply(text, change);
    const after = reviewThreads(path, parseDocument(resolved).document);
    expect(after.map((t) => t.status).slice(0, 2)).toEqual(['resolved', 'open']);
    expect(after[0]).toEqual({ ...first, status: 'resolved' });
    expect(resolved.split('\n').filter((l, i) => l !== text.split('\n')[i])).toHaveLength(1);
    const back = threadStatusEdit(resolved, first.headingId, 'open');
    expect(back === undefined ? '' : apply(resolved, back)).toBe(text);
  });

  it('gives nothing for a status that is that already, or a thread it cannot find', async () => {
    const { text } = await pulled('web-replies-resolved-reaction.docx');
    const [first] = reviewThreads('r', parseDocument(text).document);
    expect(threadStatusEdit(text, first?.headingId ?? ('' as never), 'open')).toBeUndefined();
    expect(threadStatusEdit(text, 'zzzzzzzzzz' as never, 'resolved')).toBeUndefined();
    const withoutStatus = '<!-- stanza: #k7m2q9x4zb -->\n## A\n\nText.\n\n## B\n\nStatus: open.\n';
    expect(threadStatusEdit(withoutStatus, 'k7m2q9x4zb' as never, 'resolved')).toBeUndefined();
  });
});

describe('the hints of a place', () => {
  it('reads positions and quotes, also a long quote by its two ends', () => {
    expect(positionOf('In the 12th paragraph under [Host](x#a), at "y".')).toEqual({
      kind: 'under',
      paragraph: 12,
    });
    expect(positionOf('On [Context](x#a), at "y".')).toBeUndefined();
    expect(quoteOf('On [x](y), at "He said "no" here".')).toEqual({ start: 'He said "no" here' });
    expect(quoteOf('On x, at "start…end".')).toEqual({ start: 'start', end: 'end' });
    expect(quoteOf('On x.')).toBeUndefined();
  });
});

describe('latestThreads (ADR 0086)', () => {
  const thread = (review: string, word: string | undefined, times: string[]): ReviewThread => ({
    review,
    title: word ?? 'by hand',
    status: 'open',
    ...(word !== undefined ? { wordComment: word } : {}),
    comments: times.map((time) => ({ author: 'Ada', time, text: 'Hi', reactions: [] })),
    notes: [],
  });

  it('shows a Word comment pulled twice once, from the later pull of the same file', async () => {
    const first = await pulled('web-replies-resolved-reaction.docx');
    const second = await pulled('web-replies-resolved-reaction.docx');
    // In one project the second pull gets a number, as with `review pull` run twice.
    const secondPath = second.path.replace(/\.stanza\.md$/, '-2.stanza.md');
    const all = [
      ...reviewThreads(first.path, parseDocument(first.text).document),
      ...reviewThreads(secondPath, parseDocument(second.text).document),
    ];
    const shown = latestThreads(all);
    expect(shown).toHaveLength(all.length / 2);
    expect(new Set(shown.map((t) => t.review))).toEqual(new Set([secondPath]));
  });

  it('keeps the copy with the latest comment, in the place of the first copy', () => {
    const old = thread('reviews/a-2026-11-20.stanza.md', 'AAAAAAAA', ['2026-11-20 10:00 UTC']);
    const other = thread('reviews/a-2026-11-20.stanza.md', 'BBBBBBBB', ['2026-11-20 11:00 UTC']);
    const replied = thread('reviews/a-2026-11-18.stanza.md', 'AAAAAAAA', [
      '2026-11-20 10:00 UTC',
      '2026-11-21 09:00 UTC',
    ]);
    const byHand = thread('reviews/a-2026-11-20.stanza.md', undefined, []);
    expect(latestThreads([old, other, byHand, replied, byHand])).toEqual([
      replied,
      other,
      byHand,
      byHand,
    ]);
    // On the same time, the review written later: by date, then by number.
    const numbered = { ...old, review: 'reviews/a-2026-11-20-10.stanza.md' };
    const second = { ...old, review: 'reviews/a-2026-11-20-2.stanza.md' };
    expect(latestThreads([second, old, numbered])).toEqual([numbered]);
  });
});
