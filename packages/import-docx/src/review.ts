import { isNodeId, type NodeId } from '@stanza/core';
import { readDocx, type ReadFailure } from './docx-package.js';
import { descendantsOf, elementsOf, type XmlElement } from './xml.js';

/**
 * Where a comment is, by the bookmarks of the export (ADR 0009, ADR 0084): `inside` when its
 * selection holds part of a block with an ID, `after` one when it covers only text without an
 * ID, or `unplaced` when no Stanza bookmark comes before it.
 */
export type CommentPlacement = 'inside' | 'after' | 'unplaced';

export interface ReviewComment {
  /** The `w:id` of the comment in the file. */
  readonly id: string;
  readonly author: string;
  /** As Word wrote it, such as `2026-11-21T10:15:00Z`, when it is there. */
  readonly date?: string;
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
}

export interface ReviewReading {
  /** The block IDs of the Stanza bookmarks of the file, in document order, each once. */
  readonly bookmarks: readonly NodeId[];
  /** In the order of the file's comments part. */
  readonly comments: readonly ReviewComment[];
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
function walk(document: XmlElement): { bookmarks: NodeId[]; anchors: Map<string, Anchor> } {
  const bookmarks: NodeId[] = [];
  const seen = new Set<NodeId>();
  const open = new Map<string, NodeId>();
  const anchors = new Map<string, Anchor>();
  /** Comments whose range has started and not yet ended. */
  const active = new Set<string>();
  let last: NodeId | undefined;
  const start = (commentId: string | undefined, ranged: boolean): void => {
    if (commentId === undefined || anchors.has(commentId)) return;
    const inside = [...open.values()].at(-1);
    anchors.set(commentId, { before: last, covered: inside === undefined ? [] : [inside] });
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
  return { bookmarks, anchors };
}

/**
 * Reads the comments of a reviewed DOCX that Stanza exported, and places each one by the bookmarks
 * of the blocks. The file is only read: nothing in it is applied to the source.
 */
export function readReview(bytes: Uint8Array): ReadReviewResult {
  const read = readDocx(bytes);
  if (!read.ok) return read;
  const { bookmarks, anchors } = walk(read.parts.document);
  const comments = elementsOf(read.parts.comments, 'comment').map((comment): ReviewComment => {
    const id = comment.attrs['id'] ?? '';
    const date = comment.attrs['date'];
    const { placement, block, blocks } = placementOf(anchors.get(id));
    return {
      id,
      author: comment.attrs['author'] ?? '',
      ...(date !== undefined ? { date } : {}),
      text: commentText(comment),
      placement,
      ...(block !== undefined ? { block } : {}),
      blocks,
    };
  });
  return { ok: true, review: { bookmarks, comments } };
}
