import { indexReferences, type Document, type NodeId } from '@stanza/core';
import { readReview, type ReviewComment, type ReviewReading } from '@stanza/import-docx';
import type { LoadedProject } from './load.js';

/** Where a block of the project is: its document and the heading of its section. */
export interface BlockLocation {
  readonly document: string;
  /** The plain text of the heading the block is in, or is; undefined before the first heading. */
  readonly heading?: string;
  readonly headingId?: NodeId;
}

export interface PlacedComment extends ReviewComment {
  readonly location: BlockLocation;
}

export interface ReviewInspection {
  /** The document most bookmarks of the file belong to; undefined when none is known. */
  readonly document?: string;
  /** Comments on blocks that the project still has, in the order of the file. */
  readonly placed: readonly PlacedComment[];
  /** Comments without a bookmark before them, or on a block that the project no longer has. */
  readonly unplaced: readonly ReviewComment[];
  /** Blocks of `document` with an ID that have no bookmark in the file. */
  readonly missing: readonly NodeId[];
  /** Bookmarks of the file whose block the project does not have. */
  readonly unknown: readonly NodeId[];
  readonly bookmarks: number;
}

const TOP_LEVEL = /^blocks\[(\d+)\]/;

const headingText = (document: Document, index: number): string | undefined => {
  const block = document.blocks[index];
  return block?.type === 'heading'
    ? block.content.map((inline) => inline.text).join('')
    : undefined;
};

/** Every block with an ID, with its document and section (ADR 0084). */
function locate(loaded: LoadedProject): Map<NodeId, BlockLocation> {
  const found = new Map<NodeId, BlockLocation>();
  for (const { path, document } of loaded.documents) {
    // The heading that each top-level block falls under.
    const sections: (number | undefined)[] = [];
    let current: number | undefined;
    document.blocks.forEach((block, index) => {
      if (block.type === 'heading') current = index;
      sections.push(current);
    });
    for (const target of indexReferences(document).targets.values()) {
      if (found.has(target.id)) continue;
      const top = Number(TOP_LEVEL.exec(target.path)?.[1]);
      const section = Number.isInteger(top) ? sections[top] : undefined;
      const heading = section === undefined ? undefined : headingText(document, section);
      const headingId = section === undefined ? undefined : document.blocks[section]?.id;
      found.set(target.id, {
        document: path,
        ...(heading !== undefined ? { heading } : {}),
        ...(headingId !== undefined ? { headingId } : {}),
      });
    }
  }
  return found;
}

/**
 * Places the comments of a reviewed DOCX in the project by block ID, and compares the bookmarks of
 * the file with the blocks of its document. A block missing from the file was added since the
 * build, or its bookmark was lost in review; the two cannot be told apart without the revision
 * the file was built from (item 138).
 */
export function inspectReview(loaded: LoadedProject, review: ReviewReading): ReviewInspection {
  const locations = locate(loaded);
  const counts = new Map<string, number>();
  for (const id of review.bookmarks) {
    const document = locations.get(id)?.document;
    if (document !== undefined) counts.set(document, (counts.get(document) ?? 0) + 1);
  }
  const document = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

  const placed: PlacedComment[] = [];
  const unplaced: ReviewComment[] = [];
  for (const comment of review.comments) {
    const location = comment.block === undefined ? undefined : locations.get(comment.block);
    if (location === undefined) unplaced.push(comment);
    else placed.push({ ...comment, location });
  }

  const inFile = new Set(review.bookmarks);
  const missing =
    document === undefined
      ? []
      : [...locations]
          .filter(([id, location]) => location.document === document && !inFile.has(id))
          .map(([id]) => id);
  const unknown = review.bookmarks.filter((id) => !locations.has(id));
  return {
    ...(document !== undefined ? { document } : {}),
    placed,
    unplaced,
    missing,
    unknown,
    bookmarks: review.bookmarks.length,
  };
}

export type ReviewFileResult =
  | { readonly ok: true; readonly inspection: ReviewInspection }
  | { readonly ok: false; readonly message: string };

/** Reads a reviewed DOCX and inspects it against a loaded project. */
export function inspectReviewFile(loaded: LoadedProject, bytes: Uint8Array): ReviewFileResult {
  const read = readReview(bytes);
  return read.ok
    ? { ok: true, inspection: inspectReview(loaded, read.review) }
    : { ok: false, message: read.message };
}
