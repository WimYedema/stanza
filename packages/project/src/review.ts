import { contentHash, indexReferences, type Document, type NodeId } from '@stanza/core';
import { parseDocument } from '@stanza/format';
import {
  readReview,
  type FileLabel,
  type ReviewComment,
  type ReviewReading,
  type ReviewStamp,
} from '@stanza/import-docx';
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
  /** The revision stamp of the file (ADR 0084), when it has one. */
  readonly stamp?: ReviewStamp;
  /** When the file was last saved, in UTC. */
  readonly savedAt?: string;
  /**
   * Whether the document has changed since the file was built: its content hash against the stamp.
   * Undefined when the file has no hash or the current text was not given.
   */
  readonly sourceChanged?: boolean;
  /**
   * With the source embedded in the file, `missing` is told apart: blocks of the reviewed version
   * whose bookmark the review lost, and blocks added to the document since the build. Undefined
   * without an embedded source.
   */
  readonly lost?: readonly NodeId[];
  readonly added?: readonly NodeId[];
  /** The sensitivity labels of the file (ADR 0087), at most one per tenant. */
  readonly sensitivityLabels: readonly FileLabel[];
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
export function inspectReview(
  loaded: LoadedProject,
  review: ReviewReading,
  currentText?: (document: string) => string | undefined,
): ReviewInspection {
  const locations = locate(loaded);
  const counts = new Map<string, number>();
  for (const id of review.bookmarks) {
    const document = locations.get(id)?.document;
    if (document !== undefined) counts.set(document, (counts.get(document) ?? 0) + 1);
  }
  // The stamp names the document; without one, the document that holds most of the bookmarks.
  const stamped = review.stamp?.document;
  const document =
    stamped !== undefined && loaded.documents.some((entry) => entry.path === stamped)
      ? stamped
      : [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

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

  const hash = review.stamp?.contentHash;
  const current = document === undefined ? undefined : currentText?.(document);
  const sourceChanged =
    hash === undefined || current === undefined ? undefined : contentHash(current) !== hash;
  let split: { lost: NodeId[]; added: NodeId[] } | undefined;
  if (review.source !== undefined && document !== undefined) {
    const reviewed = new Set(
      indexReferences(parseDocument(review.source.text).document).targets.keys(),
    );
    split = {
      lost: [...reviewed].filter((id) => !inFile.has(id)),
      added: missing.filter((id) => !reviewed.has(id)),
    };
  }
  return {
    ...(document !== undefined ? { document } : {}),
    placed,
    unplaced,
    missing,
    unknown,
    bookmarks: review.bookmarks.length,
    ...(review.stamp !== undefined ? { stamp: review.stamp } : {}),
    ...(review.savedAt !== undefined ? { savedAt: review.savedAt } : {}),
    ...(sourceChanged !== undefined ? { sourceChanged } : {}),
    ...(split ?? {}),
    sensitivityLabels: review.sensitivityLabels,
  };
}

export type ReviewFileResult =
  | { readonly ok: true; readonly inspection: ReviewInspection }
  | { readonly ok: false; readonly message: string };

/**
 * Reads a reviewed DOCX and inspects it against a loaded project. With `readText`, the current
 * text of the document is compared with the stamp of the file.
 */
export async function inspectReviewFile(
  loaded: LoadedProject,
  bytes: Uint8Array,
  readText?: (path: string) => Promise<string>,
): Promise<ReviewFileResult> {
  const read = readReview(bytes);
  if (!read.ok) return { ok: false, message: read.message };
  const texts = new Map<string, string>();
  const stamped = read.review.stamp?.document;
  if (readText !== undefined && stamped !== undefined) {
    try {
      texts.set(stamped, await readText(stamped));
    } catch {
      // A document that cannot be read is not compared.
    }
  }
  return { ok: true, inspection: inspectReview(loaded, read.review, (path) => texts.get(path)) };
}
