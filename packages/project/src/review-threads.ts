import type { Block, Document, Inline, NodeId } from '@stanza/core';

/**
 * Where a thread is within its block (ADR 0086), as the sentence of the place says it: hints that
 * tell apart a quote that occurs more than once. The block itself is the anchor.
 */
export type ThreadPosition =
  /** The nth paragraph under the anchor, counted as in the DOCX; the anchor is a heading. */
  | { readonly kind: 'under'; readonly paragraph: number }
  /** The nth paragraph after the anchor, a table. */
  | { readonly kind: 'after'; readonly paragraph: number }
  /** A cell of the anchor, a table, counted from 1 with the header row. */
  | { readonly kind: 'cell'; readonly row: number; readonly column: number };

/** The text a thread covers, whole, or as its start and end when it was too long to keep. */
export interface ThreadQuote {
  readonly start: string;
  readonly end?: string;
}

export interface ThreadComment {
  readonly author: string;
  /** As the review document writes it, such as `2026-11-21 15:25 UTC`. */
  readonly time: string;
  readonly text: string;
  /** Such as `thumbs up (Ada Reviewer)`, as written. */
  readonly reactions: readonly string[];
}

/** A thread of a review document, read back from the layout of ADR 0084. */
export interface ReviewThread {
  /** The review document, relative to the project root. */
  readonly review: string;
  /** The ID of the heading of the thread in the review document, to open it there. */
  readonly headingId?: NodeId;
  readonly title: string;
  /** The block the thread is on: the first link of its place to a block of the document. */
  readonly anchor?: NodeId;
  readonly position?: ThreadPosition;
  readonly quote?: ThreadQuote;
  readonly status: 'open' | 'resolved';
  readonly wordComment?: string;
  /** The comment that starts the thread, then its replies. */
  readonly comments: readonly ThreadComment[];
  /**
   * Other paragraphs of the thread, in order: the text before and after of a change found in the
   * file, a tracked change, or what the author added by hand.
   */
  readonly notes: readonly string[];
}

const plain = (inlines: readonly Inline[]): string => inlines.map((i) => i.text).join('');

/** The ID after `#` in the first link of some inlines that points at a block, if any. */
function firstAnchor(inlines: readonly Inline[]): NodeId | undefined {
  for (const inline of inlines) {
    for (const mark of inline.marks) {
      if (mark.type !== 'link') continue;
      const hash = mark.href.indexOf('#');
      if (hash >= 0 && hash < mark.href.length - 1) return mark.href.slice(hash + 1) as NodeId;
    }
  }
  return undefined;
}

const ORDINAL = '(\\d+)(?:st|nd|rd|th)';

/** The position the sentence of a place gives, if it gives one. */
export function positionOf(sentence: string): ThreadPosition | undefined {
  const cell = /\brow (\d+), column (\d+)\b/.exec(sentence);
  if (cell !== null) return { kind: 'cell', row: Number(cell[1]), column: Number(cell[2]) };
  const under = new RegExp(`\\bIn the ${ORDINAL} paragraph under\\b`).exec(sentence);
  if (under !== null) return { kind: 'under', paragraph: Number(under[1]) };
  const after = new RegExp(`\\bIn the ${ORDINAL} paragraph after\\b`).exec(sentence);
  if (after !== null) return { kind: 'after', paragraph: Number(after[1]) };
  return undefined;
}

/** The quote of a place, `at "…"`, split at the ellipsis that joins the two ends of a long one. */
export function quoteOf(sentence: string): ThreadQuote | undefined {
  const at = sentence.lastIndexOf(', at "');
  if (at < 0) return undefined;
  const rest = sentence.slice(at + ', at "'.length);
  const close = rest.lastIndexOf('"');
  if (close <= 0) return undefined;
  const quote = rest.slice(0, close);
  const ellipsis = quote.indexOf('…');
  return ellipsis < 0
    ? { start: quote }
    : { start: quote.slice(0, ellipsis), end: quote.slice(ellipsis + 1) };
}

/**
 * The label of a comment as `review pull` writes it: the author, then the time in one of the forms
 * of ADR 0084 ("Times"). Only those forms, so that a comment's own paragraph that starts in bold
 * (item 214) is not taken for a new comment, and an author is never cut at a comma of the time.
 */
const LABEL = /^(.*), (time unknown|\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?: UTC|, time zone unknown)):$/;

/** A paragraph that starts a comment: the author and the time in bold, ending with a colon. */
function commentStart(block: Block): ThreadComment | undefined {
  if (block.type !== 'paragraph') return undefined;
  const [first, ...rest] = block.content;
  if (first === undefined || !first.marks.some((m) => m.type === 'strong')) return undefined;
  const label = LABEL.exec(first.text.trim());
  if (label === null) return undefined;
  return {
    author: label[1] ?? '',
    time: label[2] ?? '',
    text: plain(rest).trim(),
    reactions: [],
  };
}

/** A change of one line of a text: the characters from `start` to `end` of line `line` (from 0). */
export interface LineChange {
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The edit that resolves or reopens a thread of a review document (ADR 0086): the word after
 * `Status:` in the status paragraph under the heading with the ID, and nothing else. Undefined when
 * the text has no such heading or status, or the status is that already.
 */
export function threadStatusEdit(
  text: string,
  headingId: NodeId,
  status: ReviewThread['status'],
): LineChange | undefined {
  const lines = text.split(/\r?\n/);
  const annotation = new RegExp(
    `^<!--\\s*stanza:.*#${escapeRegExp(headingId)}(?![a-z0-9]).*-->\\s*$`,
  );
  const at = lines.findIndex((line) => annotation.test(line));
  if (at < 0 || !/^##\s/.test(lines[at + 1] ?? '')) return undefined;
  for (let i = at + 2; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^#{1,6}\s/.test(line)) return undefined;
    const found = /^Status: (open|resolved)\b/.exec(line);
    if (found === null) continue;
    if (found[1] === status) return undefined;
    return { line: i, start: 'Status: '.length, end: found[0].length, text: status };
  }
  return undefined;
}

/** The time of the last comment of a thread, as it sorts; empty when it has none or it is unknown. */
const lastTime = (thread: ReviewThread): string =>
  thread.comments
    .map((comment) => (/^\d/.test(comment.time) ? comment.time : ''))
    .reduce((latest, time) => (time > latest ? time : latest), '');

/**
 * Whether thread `a` is a later copy than `b` of the same Word comment: the one with the latest
 * comment, else the one in the review document that was written after, which `review pull` names
 * by date and then by number (`…-2026-11-24` before `…-2026-11-24-2`).
 */
function isLater(a: ReviewThread, b: ReviewThread): boolean {
  const byTime = lastTime(a).localeCompare(lastTime(b));
  if (byTime !== 0) return byTime > 0;
  const name = (thread: ReviewThread): string => thread.review.replace(/\.stanza\.md$/, '');
  return name(a).localeCompare(name(b), 'en', { numeric: true }) > 0;
}

/**
 * The threads to show of all the review documents of one document (ADR 0086): a Word comment that
 * was pulled more than once, since every pull is a snapshot (ADR 0084, "Pulling again"), is shown
 * once, by its latest copy, in the place of the first. A thread without a Word comment is kept.
 */
export function latestThreads<T extends ReviewThread>(threads: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const thread of threads) {
    if (thread.wordComment === undefined) continue;
    const known = latest.get(thread.wordComment);
    if (known === undefined || isLater(thread, known)) latest.set(thread.wordComment, thread);
  }
  const shown = new Set<string>();
  return threads.flatMap((thread) => {
    const word = thread.wordComment;
    if (word === undefined) return [thread];
    if (shown.has(word)) return [];
    shown.add(word);
    return [latest.get(word) ?? thread];
  });
}

/**
 * The threads of a review document (ADR 0086): one per level-2 heading, read by the layout that
 * `review pull` writes (ADR 0084). What cannot be read is left out of the thread rather than
 * refused, so that a review document that the author has edited still shows.
 */
export function reviewThreads(review: string, document: Document): ReviewThread[] {
  const threads: ReviewThread[] = [];
  const blocks = document.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const heading = blocks[i];
    if (heading?.type !== 'heading' || heading.level !== 2) continue;
    const body: Block[] = [];
    for (let j = i + 1; j < blocks.length; j++) {
      const block = blocks[j];
      if (block === undefined || block.type === 'heading') break;
      body.push(block);
    }

    let anchor: NodeId | undefined;
    let position: ThreadPosition | undefined;
    let quote: ThreadQuote | undefined;
    let status: ReviewThread['status'] = 'open';
    let wordComment: string | undefined;
    const comments: ThreadComment[] = [];
    const notes: string[] = [];
    let placeRead = false;
    for (const block of body) {
      if (block.type !== 'paragraph') continue;
      const text = plain(block.content);
      const statusLine = /^Status: (open|resolved)\b/.exec(text);
      if (statusLine !== null) {
        status = statusLine[1] === 'resolved' ? 'resolved' : 'open';
        wordComment = /\bWord comment ([0-9A-F]{8})\b/.exec(text)?.[1];
        continue;
      }
      const started = commentStart(block);
      if (started !== undefined) {
        comments.push(started);
        continue;
      }
      const last = comments.at(-1);
      if (last !== undefined) {
        const reactions = /^Reactions: (.*)\.$/.exec(text);
        comments[comments.length - 1] = reactions
          ? { ...last, reactions: reactions[1]?.split(', ') ?? [] }
          : { ...last, text: `${last.text}\n${text}`.trim() };
        continue;
      }
      if (!placeRead) {
        placeRead = true;
        anchor = firstAnchor(block.content);
        position = positionOf(text);
        quote = quoteOf(text);
      } else {
        notes.push(text);
      }
    }
    threads.push({
      review,
      ...(heading.id !== undefined ? { headingId: heading.id } : {}),
      title: plain(heading.content),
      ...(anchor !== undefined ? { anchor } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(quote !== undefined ? { quote } : {}),
      status,
      ...(wordComment !== undefined ? { wordComment } : {}),
      comments,
      notes,
    });
  }
  return threads;
}
