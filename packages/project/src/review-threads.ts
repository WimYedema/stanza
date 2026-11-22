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

/** A paragraph that starts a comment: the author and the time in bold, ending with a colon. */
function commentStart(block: Block): ThreadComment | undefined {
  if (block.type !== 'paragraph') return undefined;
  const [first, ...rest] = block.content;
  if (first === undefined || !first.marks.some((m) => m.type === 'strong')) return undefined;
  const label = /^(.*), (.+):$/.exec(first.text.trim());
  if (label === null) return undefined;
  return {
    author: label[1] ?? '',
    time: label[2] ?? '',
    text: plain(rest).trim(),
    reactions: [],
  };
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
