import { describe, expect, it } from 'vitest';
import { buildDocx, para, run } from './docx.testing.js';
import { readReview } from './review.js';

const A = 'aaaaaaaaaa';
const B = 'bbbbbbbbbb';

/** A paragraph inside the bookmark of a block, as the exporter writes it (ADR 0009). */
const block = (wid: number, id: string, content: string, prefix = 'stanza'): string =>
  para(
    `<w:bookmarkStart w:id="${String(wid)}" w:name="${prefix}_${id}"/>${content}<w:bookmarkEnd w:id="${String(wid)}"/>`,
  );

const range = (cid: number, content: string): string =>
  `<w:commentRangeStart w:id="${String(cid)}"/>${content}<w:commentRangeEnd w:id="${String(cid)}"/>` +
  `<w:r><w:commentReference w:id="${String(cid)}"/></w:r>`;

const comment = (cid: number, text: string, author = 'Reviewer'): string =>
  `<w:comment w:id="${String(cid)}" w:author="${author}" w:date="2026-11-21T10:00:00Z">` +
  text
    .split('\n')
    .map((line) => para(run(line)))
    .join('') +
  `</w:comment>`;

describe('readReview', () => {
  it('reads the bookmarks in order and places comments inside or after a block', () => {
    const bytes = buildDocx({
      body:
        block(1, A, range(0, run('Heading'))) +
        para(range(1, run('A paragraph without an ID.'))) +
        block(2, B, run('Table cell')),
      comments: comment(0, 'Why this control?\nSecond line.') + comment(1, 'Add a diagram.'),
    });
    const read = readReview(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.review.bookmarks).toEqual([A, B]);
    expect(read.review.comments).toEqual([
      {
        id: '0',
        author: 'Reviewer',
        date: '2026-11-21T10:00:00Z',
        text: 'Why this control?\nSecond line.',
        placement: 'inside',
        block: A,
        blocks: [A],
      },
      {
        id: '1',
        author: 'Reviewer',
        date: '2026-11-21T10:00:00Z',
        text: 'Add a diagram.',
        placement: 'after',
        block: A,
        blocks: [A],
      },
    ]);
  });

  it('takes the first block inside a selection that starts in text without an ID', () => {
    const C = 'cccccccccc';
    const bytes = buildDocx({
      body:
        block(1, A, run('Heading A')) +
        para('<w:commentRangeStart w:id="0"/>' + run('Text without an ID.')) +
        block(2, B, run('Heading B')) +
        block(3, C, run('Heading C') + '<w:commentRangeEnd w:id="0"/>') +
        block(4, 'dddddddddd', run('After the selection')),
      comments: comment(0, 'Spans three paragraphs.'),
    });
    const read = readReview(bytes);
    expect(read.ok && read.review.comments[0]).toMatchObject({
      placement: 'inside',
      block: B,
      blocks: [B, C],
    });
  });

  it('keeps the block where a selection starts, and adds the blocks it runs into', () => {
    const bytes = buildDocx({
      body:
        para(
          `<w:bookmarkStart w:id="1" w:name="stanza_${A}"/><w:commentRangeStart w:id="0"/>` +
            `${run('Start')}<w:bookmarkEnd w:id="1"/>`,
        ) + block(2, B, run('End') + '<w:commentRangeEnd w:id="0"/>'),
      comments: comment(0, 'Across a heading.'),
    });
    const read = readReview(bytes);
    expect(read.ok && read.review.comments[0]).toMatchObject({ block: A, blocks: [A, B] });
  });

  it('reads phrase_ bookmarks of files exported before the rename', () => {
    const bytes = buildDocx({
      body: block(1, A, range(0, run('Old')), 'phrase'),
      comments: comment(0, 'Still placed.'),
    });
    const read = readReview(bytes);
    expect(read.ok && read.review.bookmarks).toEqual([A]);
    expect(read.ok && read.review.comments[0]?.block).toBe(A);
  });

  it('reports a comment before any bookmark as unplaced, and ignores other bookmarks', () => {
    const bytes = buildDocx({
      body:
        para(
          `<w:bookmarkStart w:id="9" w:name="_Toc123"/>${range(0, run('Top'))}<w:bookmarkEnd w:id="9"/>`,
        ) + block(1, A, run('Later')),
      comments: comment(0, 'On the title.'),
    });
    const read = readReview(bytes);
    expect(read.ok && read.review.bookmarks).toEqual([A]);
    expect(read.ok && read.review.comments.map((c) => c.placement)).toEqual(['unplaced']);
  });

  it('reads a file without comments', () => {
    const read = readReview(buildDocx({ body: block(1, A, run('Text')) }));
    expect(read.ok && read.review).toEqual({ bookmarks: [A], comments: [] });
  });

  it('refuses what is not a DOCX', () => {
    const read = readReview(new Uint8Array([1, 2, 3]));
    expect(read.ok).toBe(false);
  });
});
