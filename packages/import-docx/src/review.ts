import { isNodeId, type NodeId } from '@stanza/core';
import { readDocx, type ReadFailure } from './docx-package.js';
import {
  commentDetails,
  embeddedSourceOf,
  paragraphIdOf,
  createdAtOf,
  savedAtOf,
  stampOf,
  type EmbeddedSource,
  type Reaction,
  type ReviewStamp,
} from './review-parts.js';
import { bodyText, type DocxParagraph, type TrackedChange } from './review-text.js';
import { descendantsOf, elementsOf, type XmlElement } from './xml.js';

/**
 * Where a comment is, by the bookmarks of the export (ADR 0009, ADR 0084): `inside` when its
 * selection holds part of a block with an ID, `after` one when it covers only text without an
 * ID, or `unplaced` when no Stanza bookmark comes before it.
 */
export type CommentPlacement = 'inside' | 'after' | 'unplaced';

export interface ReviewComment {
  /** The `w:id` of the comment in the file. Word renumbers it on every save. */
  readonly id: string;
  /** The identity of the comment, which survives saves (`commentsIds.xml`, ADR 0084). */
  readonly durableId?: string;
  /** The durable ID of the comment this one answers, for a reply. */
  readonly replyTo?: string;
  readonly resolved: boolean;
  /** The display name of the author only; initials and accounts are not read (ADR 0084). */
  readonly author: string;
  /**
   * The time of the comment: in UTC from `commentsExtensible.xml` when the file has it, else
   * `w:date`, which is local time whatever its zone says, and `dateIsUtc` is false.
   */
  readonly date?: string;
  readonly dateIsUtc: boolean;
  readonly reactions: readonly Reaction[];
  /** The text the selection covers, paragraphs separated by `\n`; empty for a comment on a point. */
  readonly quote: string;
  /** The text of the comment, one line per paragraph. */
  readonly text: string;
  readonly placement: CommentPlacement;
  /**
   * The main block: the one whose bookmark holds the start of the comment, else the first one
   * that starts inside its selection, else the last one before it.
   */
  readonly block?: NodeId;
  /** Every block the selection covers, the main block first; just `block` when it is `after`. */
  readonly blocks: readonly NodeId[];
  /**
   * The index in `paragraphs` of the paragraph where the comment starts; undefined when the file
   * does not show where.
   */
  readonly paragraph?: number;
}

export interface ReviewReading {
  /** The block IDs of the Stanza bookmarks of the file, in document order, each once. */
  readonly bookmarks: readonly NodeId[];
  /** In the order of the file's comments part. */
  readonly comments: readonly ReviewComment[];
  /** The revision stamp (ADR 0084), for a file exported since item 138. */
  readonly stamp?: ReviewStamp;
  /** The source the file was built from, when it was embedded. */
  readonly source?: EmbeddedSource;
  /** When the file was last saved, in UTC, so that a file that is behind can be seen. */
  readonly savedAt?: string;
  /** When the file was made, which a save in Word leaves alone (ADR 0088). */
  readonly createdAt?: string;
  /** The paragraphs of the body as built, to compare with the reviewed version (ADR 0084). */
  readonly paragraphs: readonly DocxParagraph[];
  /** Tracked changes in the body, which are reported and never applied. */
  readonly trackedChanges: readonly TrackedChange[];
}

export type ReadReviewResult =
  | { readonly ok: true; readonly review: ReviewReading }
  | { readonly ok: false; readonly reason: ReadFailure; readonly message: string };

/**
 * Bookmarks are `stanza_<id>`; `phrase_<id>` is read too, so files sent out for review before the
 * rename to Stanza stay readable (ADR 0083).
 */
const BOOKMARK = /^(?:stanza|phrase)_(.+)$/;

function blockOf(name: string | undefined): NodeId | undefined {
  const id = BOOKMARK.exec(name ?? '')?.[1];
  return id !== undefined && isNodeId(id) ? id : undefined;
}

function commentText(comment: XmlElement): string {
  return descendantsOf(comment, 'p')
    .map((paragraph) =>
      descendantsOf(paragraph, 't')
        .flatMap((t) => t.children.filter((child): child is string => typeof child === 'string'))
        .join(''),
    )
    .join('\n')
    .trim();
}

interface Anchor {
  /** The last block whose bookmark started before the comment. */
  readonly before: NodeId | undefined;
  /**
   * The blocks the selection covers: the one whose bookmark is open where it starts, then each
   * one whose bookmark starts within it.
   */
  readonly covered: NodeId[];
  /** The index of the body paragraph where the comment starts, as `bodyText` counts them. */
  readonly paragraph: number;
}

const UNPLACED = { placement: 'unplaced', blocks: [] } as const;

function placementOf(
  at: Anchor | undefined,
): Pick<ReviewComment, 'placement' | 'block' | 'blocks'> {
  if (at === undefined) return UNPLACED;
  const [block] = at.covered;
  if (block !== undefined) return { placement: 'inside', block, blocks: at.covered };
  if (at.before !== undefined) return { placement: 'after', block: at.before, blocks: [at.before] };
  return UNPLACED;
}

/** Walks the body in document order and finds the bookmarks and what each comment covers. */
function walk(document: XmlElement): {
  bookmarks: NodeId[];
  anchors: Map<string, Anchor>;
  quotes: Map<string, string>;
} {
  const quotes = new Map<string, string>();
  const quote = (text: string): void => {
    for (const commentId of active) quotes.set(commentId, (quotes.get(commentId) ?? '') + text);
  };
  const bookmarks: NodeId[] = [];
  const seen = new Set<NodeId>();
  const open = new Map<string, NodeId>();
  const anchors = new Map<string, Anchor>();
  /** Comments whose range has started and not yet ended. */
  const active = new Set<string>();
  let last: NodeId | undefined;
  /** How many body paragraphs have started so far. */
  let paragraphs = 0;
  const start = (commentId: string | undefined, ranged: boolean): void => {
    if (commentId === undefined || anchors.has(commentId)) return;
    const inside = [...open.values()].at(-1);
    anchors.set(commentId, {
      before: last,
      covered: inside === undefined ? [] : [inside],
      paragraph: Math.max(0, paragraphs - 1),
    });
    if (ranged) active.add(commentId);
  };
  const visit = (element: XmlElement): void => {
    for (const child of element.children) {
      if (typeof child === 'string') continue;
      switch (child.name) {
        case 'bookmarkStart': {
          const block = blockOf(child.attrs['name']);
          const id = child.attrs['id'];
          if (block === undefined || id === undefined) break;
          if (!seen.has(block)) {
            seen.add(block);
            bookmarks.push(block);
          }
          for (const commentId of active) {
            const covered = anchors.get(commentId)?.covered;
            if (covered !== undefined && !covered.includes(block)) covered.push(block);
          }
          open.set(id, block);
          last = block;
          break;
        }
        case 'bookmarkEnd':
          if (child.attrs['id'] !== undefined) open.delete(child.attrs['id']);
          break;
        case 'commentRangeStart':
          start(child.attrs['id'], true);
          break;
        case 'commentRangeEnd':
          if (child.attrs['id'] !== undefined) active.delete(child.attrs['id']);
          break;
        case 't':
          quote(child.children.filter((c): c is string => typeof c === 'string').join(''));
          break;
        case 'tab':
          quote('\t');
          break;
        case 'br':
          quote('\n');
          break;
        // Deleted text of a tracked change is not what the reviewer saw.
        case 'del':
          break;
        case 'p':
          paragraphs += 1;
          visit(child);
          quote('\n');
          break;
        // A comment on a point has only its reference.
        case 'commentReference':
          start(child.attrs['id'], false);
          break;
        default:
          visit(child);
      }
    }
  };
  visit(document);
  return { bookmarks, anchors, quotes };
}

/**
 * Reads the comments of a reviewed DOCX that Stanza exported, and places each one by the bookmarks
 * of the blocks. The file is only read: nothing in it is applied to the source.
 */
export function readReview(bytes: Uint8Array): ReadReviewResult {
  const read = readDocx(bytes);
  if (!read.ok) return read;
  const { parts } = read;
  const { bookmarks, anchors, quotes } = walk(parts.document);
  const details = commentDetails(parts);
  const durableOf = (paragraph: string | undefined): string | undefined =>
    paragraph === undefined ? undefined : details.get(paragraph)?.durableId;
  const comments = elementsOf(parts.comments, 'comment').map((comment): ReviewComment => {
    const id = comment.attrs['id'] ?? '';
    const more = details.get(paragraphIdOf(comment) ?? '');
    // `w:date` holds local time; Word desktop marks it with a `Z` all the same.
    const local = comment.attrs['date']?.replace(/Z$/, '');
    const date = more?.dateUtc ?? local;
    const replyTo = durableOf(more?.parentParagraph);
    const anchor = anchors.get(id);
    const { placement, block, blocks } = placementOf(anchor);
    return {
      id,
      ...(more?.durableId !== undefined ? { durableId: more.durableId } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
      resolved: more?.resolved ?? false,
      author: comment.attrs['author'] ?? '',
      ...(date !== undefined ? { date } : {}),
      dateIsUtc: more?.dateUtc !== undefined,
      reactions: more?.reactions ?? [],
      text: commentText(comment),
      quote: (quotes.get(id) ?? '').replace(/\n+$/, ''),
      placement,
      ...(block !== undefined ? { block } : {}),
      blocks,
      ...(anchor !== undefined ? { paragraph: anchor.paragraph } : {}),
    };
  });
  const stamp = stampOf(parts);
  const source = embeddedSourceOf(parts);
  const savedAt = savedAtOf(parts);
  const createdAt = createdAtOf(parts);
  const body = bodyText(parts.document);
  return {
    ok: true,
    review: {
      bookmarks,
      comments,
      paragraphs: body.paragraphs,
      trackedChanges: body.trackedChanges,
      ...(stamp !== undefined ? { stamp } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(savedAt !== undefined ? { savedAt } : {}),
      ...(createdAt !== undefined ? { createdAt } : {}),
    },
  };
}
