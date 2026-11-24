import {
  applyDefaults,
  contentHash,
  type Block,
  type Document,
  type Inline,
  type NodeId,
} from '@stanza/core';
import { exportDocx } from '@stanza/export-docx';
import { parseDocument } from '@stanza/format';
import {
  readBodyText,
  readReview,
  type DocxParagraph,
  type ReviewComment,
  type ReviewReading,
} from '@stanza/import-docx';
import type { ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX } from './files.js';
import { loadProject, type LoadedProject } from './load.js';
import { referenceTargets } from './reference-links.js';
import { inspectReview, type ReviewInspection } from './review.js';
import type { ProjectStorage } from './storage.js';
import { NO_PROJECT_MESSAGE, storeNewDocument } from './store-document.js';
import { DEFAULT_BUILD_DATE } from './build.js';

/** Where review documents go (ADR 0084). */
export const REVIEWS_DIR = 'reviews';

export interface PullReviewOptions {
  /** The name of the DOCX, as the opening paragraph of the review document names it. */
  readonly fileName: string;
  /** The host supplies the random bytes for new IDs, since `core` has none. */
  readonly randomBytes: () => Uint8Array;
  /**
   * The source of a document at a commit, from Git, for a file that has a stamp and no embedded
   * source (ADR 0084, "The reviewed version"). Undefined when the host has no Git.
   */
  readonly sourceAt?: (commit: string, path: string) => Promise<string | undefined>;
}

export type PullReviewResult =
  | {
      readonly ok: true;
      /** The review document that was written, relative to the project root. */
      readonly document: string;
      /** The document that was reviewed. */
      readonly reviewed: string;
      /** What the pull found, as lines for the command line and the output channel. */
      readonly lines: readonly string[];
      /** What checking the review document against the project found. */
      readonly diagnostics: readonly ProjectDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly reason: 'no-project' | 'not-a-docx' | 'unreadable' | 'not-in-project' | 'no-ids';
      readonly message: string;
    };

const text = (value: string, marks: Inline['marks'] = []): Inline => ({
  type: 'text',
  text: value,
  marks,
});
const strong = (value: string): Inline => text(value, [{ type: 'strong' }]);
const link = (value: string, href: string): Inline => text(value, [{ type: 'link', href }]);
const paragraph = (...content: Inline[]): Block => ({ type: 'paragraph', content });

/** The quote as the review document gives it: whole up to 200 characters, else both ends. */
export function quoteText(quote: string): string {
  const flat = quote.replace(/\s+/g, ' ').trim();
  return flat.length <= 200 ? flat : `${flat.slice(0, 100)}…${flat.slice(-100)}`;
}

/** The first words of a comment, as the heading of its thread. */
function headingOf(comment: string): string {
  const flat = comment.replace(/\s+/g, ' ').trim();
  if (flat === '') return 'Comment';
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/** A count and a noun, with the noun in the plural unless the count is one. */
const count = (n: number, noun: string, plural = `${noun}s`): string =>
  `${String(n)} ${n === 1 ? noun : plural}`;

const SUFFIXES: Readonly<Record<number, string>> = { 1: 'st', 2: 'nd', 3: 'rd' };
const ordinal = (n: number): string => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${String(n)}${teen ? 'th' : (SUFFIXES[n % 10] ?? 'th')}`;
};

/** The time of a comment as the review document writes it (ADR 0084, "Times"). */
function timeOf(comment: ReviewComment): string {
  if (comment.date === undefined) return 'time unknown';
  const minute = comment.date.replace('T', ' ').slice(0, 16);
  return comment.dateIsUtc ? `${minute} UTC` : `${minute}, time zone unknown`;
}

const REACTIONS: Readonly<Record<number, string>> = { 1: 'thumbs up' };

interface Located {
  readonly document: string;
  readonly heading?: string;
  /** The ID of the heading of the section, when it has one. */
  readonly headingId?: NodeId;
  readonly block: Block;
  readonly kind: Block['type'];
  /** The plain text of the section the block is in, to look for the quote. */
  readonly section: string;
  /**
   * The plain text of the blocks without an ID just before the block, where a quote can start: a
   * range that starts in text without an ID is on the first block with an ID inside it.
   */
  readonly lead: string;
}

/** How many paragraphs the exporter writes for a block in a table cell. */
function paragraphsOf(block: Block): number {
  if (block.type === 'list') {
    return block.items.reduce(
      (sum, item) =>
        sum +
        Math.max(
          1,
          item.blocks.reduce((n, b) => n + paragraphsOf(b), 0),
        ),
      0,
    );
  }
  return 1;
}

/**
 * The row and column, counted from 1 with the header row included, of the paragraph at an offset
 * from the first paragraph of a table; undefined when the offset is past the table.
 */
export function cellAt(block: Block, offset: number): { row: number; column: number } | undefined {
  if (block.type !== 'table') return undefined;
  let at = 0;
  const rows = [block.header, ...block.rows];
  for (const [r, row] of rows.entries()) {
    for (const [c, cell] of row.entries()) {
      // A cell holds at least one paragraph, also when it is empty.
      const size = Math.max(
        1,
        cell.blocks.reduce((n, b) => n + paragraphsOf(b), 0),
      );
      if (offset < at + size) return { row: r + 1, column: c + 1 };
      at += size;
    }
  }
  return undefined;
}

/** How many paragraphs the exporter writes for a whole table, or 0 for another block. */
export function tableParagraphs(block: Block): number {
  if (block.type !== 'table') return 0;
  return [block.header, ...block.rows].flat().reduce(
    (n, cell) =>
      n +
      Math.max(
        1,
        cell.blocks.reduce((m, b) => m + paragraphsOf(b), 0),
      ),
    0,
  );
}

const plain = (inlines: readonly Inline[]): string => inlines.map((i) => i.text).join('');

function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return plain(block.content);
    case 'list':
      return block.items.map((item) => item.blocks.map(blockText).join(' ')).join(' ');
    case 'table':
      return [block.header, ...block.rows]
        .flatMap((row) => row.flatMap((cell) => cell.blocks.map(blockText)))
        .join(' ');
    default:
      return block.text;
  }
}

/** Every top-level block with an ID, with its section heading and the text of that section. */
function locateBlocks(loaded: LoadedProject): Map<NodeId, Located> {
  const found = new Map<NodeId, Located>();
  for (const { path, document } of loaded.documents) {
    let heading: string | undefined;
    let start = 0;
    /** The index of the last block with an ID so far. */
    let lastWithId = -1;
    const sectionText = (from: number): string => {
      const parts: string[] = [];
      for (let i = from; i < document.blocks.length; i++) {
        const block = document.blocks[i];
        if (block === undefined || (i > from && block.type === 'heading')) break;
        parts.push(blockText(block));
      }
      return parts.join(' ');
    };
    document.blocks.forEach((block, index) => {
      if (block.type === 'heading') {
        heading = plain(block.content);
        start = index;
      }
      if (block.id !== undefined && !found.has(block.id)) {
        const sectionHeading = document.blocks[start];
        const headingId = sectionHeading?.type === 'heading' ? sectionHeading.id : undefined;
        found.set(block.id, {
          document: path,
          ...(heading !== undefined ? { heading } : {}),
          ...(headingId !== undefined ? { headingId } : {}),
          block,
          kind: block.type,
          section: sectionText(start),
          lead: document.blocks
            .slice(lastWithId + 1, index)
            .map(blockText)
            .join(' '),
        });
      }
      if (block.id !== undefined) lastWithId = index;
    });
  }
  return found;
}

/** A change between the reviewed version and the file, by the block it falls under. */
interface Edit {
  readonly block?: NodeId;
  readonly before: string;
  readonly after: string;
}

/**
 * The paragraphs that differ between the reviewed version as exported again and the reviewed
 * file: a longest common subsequence of their texts, with each run of differences as one edit.
 */
export function editsBetween(
  built: readonly DocxParagraph[],
  reviewed: readonly DocxParagraph[],
): Edit[] {
  const n = built.length;
  const m = reviewed.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = table[i] ?? [];
      row[j] =
        built[i]?.text === reviewed[j]?.text
          ? (table[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(table[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const edits: Edit[] = [];
  let before: string[] = [];
  let after: string[] = [];
  let block: NodeId | undefined;
  const flush = (): void => {
    if (before.length > 0 || after.length > 0) {
      edits.push({
        ...(block !== undefined ? { block } : {}),
        before: before.join('\n'),
        after: after.join('\n'),
      });
    }
    before = [];
    after = [];
    block = undefined;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && built[i]?.text === reviewed[j]?.text) {
      flush();
      i++;
      j++;
    } else if (j < m && (i >= n || (table[i]?.[j + 1] ?? 0) >= (table[i + 1]?.[j] ?? 0))) {
      block ??= reviewed[j]?.block;
      after.push(reviewed[j]?.text ?? '');
      j++;
    } else {
      block ??= built[i]?.block;
      before.push(built[i]?.text ?? '');
      i++;
    }
  }
  flush();
  return edits;
}

/** The source of the version that was reviewed, and how it was found. */
async function reviewedSource(
  review: ReviewReading,
  options: PullReviewOptions,
): Promise<{ text: string; from: string } | { text: undefined; why: string }> {
  if (review.source !== undefined)
    return { text: review.source.text, from: 'embedded in the file' };
  const { stamp } = review;
  if (stamp?.commit === undefined || stamp.document === undefined) {
    return { text: undefined, why: 'the file has no revision stamp' };
  }
  if (stamp.dirty === true) {
    return { text: undefined, why: 'it was built from uncommitted changes' };
  }
  if (options.sourceAt === undefined) return { text: undefined, why: 'Git is not available' };
  const found = await options.sourceAt(stamp.commit, stamp.document);
  if (found === undefined) {
    return { text: undefined, why: `commit ${stamp.commit.slice(0, 7)} is not in the repository` };
  }
  if (stamp.contentHash !== undefined && contentHash(found) !== stamp.contentHash) {
    return { text: undefined, why: 'the source at its commit does not match the file' };
  }
  return { text: found, from: `from Git at ${stamp.commit.slice(0, 7)}` };
}

/** The paragraphs of the reviewed version as the exporter makes them, or why there are none. */
async function builtParagraphs(
  loaded: LoadedProject,
  path: string,
  source: string,
): Promise<DocxParagraph[] | string> {
  const { settings, stylesheet } = loaded;
  if (settings === undefined || stylesheet === undefined) return 'the project is not in order';
  const document = parseDocument(source).document;
  const exported = await exportDocx(
    { ...document, meta: applyDefaults(settings, document.meta) },
    stylesheet,
    {
      timestamp: DEFAULT_BUILD_DATE,
      otherTargets: referenceTargets(loaded.documents)(path),
      ...(settings.linkSchemes !== undefined ? { linkSchemes: settings.linkSchemes } : {}),
    },
  );
  if (exported.bytes === undefined) return 'the reviewed version does not export any more';
  const body = readBodyText(exported.bytes);
  return body.ok ? [...body.body.paragraphs] : 'the reviewed version does not export any more';
}

/** The comments with their replies, in the order of the file and the replies in order of time. */
function threadsOf(comments: readonly ReviewComment[]): [ReviewComment, ReviewComment[]][] {
  const known = new Set(comments.flatMap((c) => (c.durableId === undefined ? [] : [c.durableId])));
  const replies = new Map<string, ReviewComment[]>();
  const tops: ReviewComment[] = [];
  for (const comment of comments) {
    if (comment.replyTo !== undefined && known.has(comment.replyTo)) {
      replies.set(comment.replyTo, [...(replies.get(comment.replyTo) ?? []), comment]);
    } else {
      tops.push(comment);
    }
  }
  const byTime = (a: ReviewComment, b: ReviewComment): number =>
    (a.date ?? '').localeCompare(b.date ?? '');
  return tops.map((top): [ReviewComment, ReviewComment[]] => [
    top,
    [...(replies.get(top.durableId ?? '') ?? [])].sort(byTime),
  ]);
}

/** The Word comment IDs that earlier review documents of the same document hold, by document. */
function pulledBefore(loaded: LoadedProject, reviewed: string): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const { path, document } of loaded.documents) {
    if (document.meta.reviews !== reviewed) continue;
    const ids = new Set<string>();
    for (const block of document.blocks) {
      if (block.type !== 'paragraph') continue;
      for (const match of plain(block.content).matchAll(/Word comment ([0-9A-F]{8})\b/g)) {
        if (match[1] !== undefined) ids.add(match[1]);
      }
    }
    found.set(path, ids);
  }
  return found;
}

interface Built {
  readonly document: Document;
  readonly lines: string[];
}

/** The review document (ADR 0084, "The review document"). */
function reviewDocument(
  loaded: LoadedProject,
  review: ReviewReading,
  inspection: ReviewInspection,
  reviewed: string,
  fileName: string,
  edits: Edit[] | string,
  reviewedFrom: string | undefined,
): Built {
  const located = locateBlocks(loaded);
  const target = loaded.documents.find((entry) => entry.path === reviewed)?.document;
  const title = target?.meta.title ?? reviewed;
  const href = (id: NodeId): string => `../${reviewed}#${id}`;
  const lines: string[] = [];
  const blocks: Block[] = [{ type: 'heading', level: 1, content: [text(`Review of ${title}`)] }];

  const threads = threadsOf(review.comments);
  const resolved = threads.filter(([top]) => top.resolved).length;
  const known = (comment: ReviewComment): boolean =>
    comment.block !== undefined && located.get(comment.block)?.document === reviewed;
  const orphaned = threads.filter(([top]) => !known(top)).length;
  const { stamp } = inspection;
  const revision =
    stamp?.commit === undefined
      ? 'revision unknown'
      : `revision ${stamp.commit.slice(0, 7)}${stamp.dirty === true ? ' with uncommitted changes' : ''}`;
  const saved =
    review.savedAt === undefined
      ? 'with no time of saving'
      : `last saved ${review.savedAt.replace('T', ' ').slice(0, 16)} UTC`;
  const changed =
    inspection.sourceChanged === true
      ? ' The document has changed since.'
      : inspection.sourceChanged === false
        ? ' The document has not changed since.'
        : '';
  const counts = `${count(review.comments.length, 'comment')} in ${count(threads.length, 'thread')}: ${String(threads.length - resolved)} open, ${String(resolved)} resolved, ${String(orphaned)} not placed.`;
  const checked =
    typeof edits === 'string'
      ? ` Edits not checked: ${edits}.`
      : ` Edits checked against the reviewed version (${reviewedFrom ?? ''}): ${edits.length === 0 ? 'none' : String(edits.length)}.`;
  blocks.push(
    paragraph(
      text(`Comments from ${fileName}, ${saved}, built from `),
      link(title, `../${reviewed}`),
      text(` at ${revision}.${changed} ${counts}${checked}`),
    ),
  );

  const placeOf = (comment: ReviewComment): Inline[] => {
    const block = comment.block;
    const where = block === undefined ? undefined : located.get(block);
    if (block === undefined || where === undefined || where.document !== reviewed) {
      // No link, so that the review document has no broken reference (ADR 0084).
      return block === undefined
        ? [text('Not placed: the file shows no block for this comment.')]
        : [
            text('On a block that the document no longer has ('),
            text(`#${block}`, [{ type: 'code' }]),
            text(' in the file).'),
          ];
    }
    const name =
      where.kind === 'heading'
        ? (where.heading ?? 'the heading')
        : where.kind === 'table'
          ? 'the table'
          : 'the block';
    const parts: Inline[] = [];
    // Positions are counted in the file: from the paragraph where the block's bookmark starts.
    const paragraphIndex = comment.paragraph;
    const firstOf = (id: NodeId): number => review.paragraphs.findIndex((p) => p.block === id);
    const offset =
      paragraphIndex === undefined || firstOf(block) < 0
        ? undefined
        : paragraphIndex - firstOf(block);
    const cell = offset === undefined ? undefined : cellAt(where.block, offset);
    const under = where.heading === undefined ? '' : ` under ${where.heading}`;
    if (where.kind === 'table' && cell !== undefined) {
      parts.push(
        text('In '),
        link(name, href(block)),
        text(`${under}, row ${String(cell.row)}, column ${String(cell.column)}`),
      );
    } else if (where.kind === 'table' && offset !== undefined && offset >= 0) {
      // Past the table: counted from the paragraph after it.
      const after = offset - tableParagraphs(where.block) + 1;
      parts.push(
        text(`In the ${ordinal(after)} paragraph after `),
        link(name, href(block)),
        text(under),
      );
    } else if (comment.placement === 'after' && paragraphIndex !== undefined) {
      // Past the block: counted from the heading of the section, which is the nearest ID.
      const heading = where.headingId;
      const from = heading === undefined ? -1 : firstOf(heading);
      if (heading !== undefined && from >= 0) {
        parts.push(
          text(`In the ${ordinal(paragraphIndex - from)} paragraph under `),
          link(where.heading ?? 'the heading', href(heading)),
        );
      } else {
        parts.push(text('After '), link(name, href(block)));
      }
    } else {
      parts.push(text(where.kind === 'table' ? 'In ' : 'On '), link(name, href(block)));
      if (where.kind === 'table') parts.push(text(under));
    }
    const crossed = comment.blocks
      .slice(1)
      .filter(
        (id) => located.get(id)?.kind === 'heading' && located.get(id)?.document === reviewed,
      );
    if (crossed.length > 0) {
      parts.push(text(', through '));
      crossed.forEach((id, index) => {
        if (index > 0) parts.push(text(', '));
        parts.push(link(located.get(id)?.heading ?? id, href(id)));
      });
    }
    const quote = quoteText(comment.quote);
    if (quote !== '') {
      parts.push(text(`, at "${quote}".`));
      const start = quote.split('…')[0]?.slice(0, 40) ?? '';
      const section = `${where.lead} ${where.section}`.replace(/\s+/g, ' ');
      if (start !== '' && !section.includes(start)) {
        parts.push(text(' The text has changed since the review.'));
      }
    } else {
      parts.push(text('.'));
    }
    return parts;
  };

  const commentParagraphs = (comment: ReviewComment): Block[] => {
    const [first = '', ...more] = comment.text.split('\n');
    const result: Block[] = [
      paragraph(strong(`${comment.author || 'Unknown'}, ${timeOf(comment)}:`), text(` ${first}`)),
      ...more.filter((line) => line.trim() !== '').map((line) => paragraph(text(line))),
    ];
    if (comment.reactions.length > 0) {
      const reactions = comment.reactions.map(
        (r) => `${REACTIONS[r.type] ?? `reaction ${String(r.type)}`} (${r.name || 'Unknown'})`,
      );
      result.push(paragraph(text(`Reactions: ${reactions.join(', ')}.`)));
    }
    return result;
  };

  for (const [top, replies] of threads) {
    blocks.push({ type: 'heading', level: 2, content: [text(headingOf(top.text))] });
    blocks.push(paragraph(...placeOf(top)));
    const word = top.durableId === undefined ? '' : ` Word comment ${top.durableId}.`;
    blocks.push(paragraph(text(`Status: ${top.resolved ? 'resolved' : 'open'}.${word}`)));
    blocks.push(...commentParagraphs(top));
    for (const reply of replies) blocks.push(...commentParagraphs(reply));
  }

  if (typeof edits !== 'string') {
    for (const edit of edits) {
      blocks.push({ type: 'heading', level: 2, content: [text('Changed text')] });
      const where = edit.block === undefined ? undefined : located.get(edit.block);
      blocks.push(
        where !== undefined && edit.block !== undefined && where.document === reviewed
          ? paragraph(
              text('Under '),
              link(where.heading ?? 'the block', href(edit.block)),
              text('.'),
            )
          : paragraph(text('At the start of the document.')),
      );
      blocks.push(paragraph(text('Status: open. Changed in the file, not applied.')));
      if (edit.before !== '')
        blocks.push(paragraph(strong('Was:'), text(` ${quoteText(edit.before)}`)));
      if (edit.after !== '')
        blocks.push(paragraph(strong('Is now:'), text(` ${quoteText(edit.after)}`)));
    }
  }
  for (const change of review.trackedChanges) {
    blocks.push({
      type: 'heading',
      level: 2,
      content: [text(change.kind === 'insertion' ? 'Tracked insertion' : 'Tracked deletion')],
    });
    const where = change.block === undefined ? undefined : located.get(change.block);
    blocks.push(
      where !== undefined && change.block !== undefined && where.document === reviewed
        ? paragraph(
            text('Under '),
            link(where.heading ?? 'the block', href(change.block)),
            text('.'),
          )
        : paragraph(text('At the start of the document.')),
    );
    blocks.push(paragraph(text('Status: open. A tracked change in the file, not applied.')));
    blocks.push(
      paragraph(
        strong(`${change.author || 'Unknown'}:`),
        text(
          ` ${change.kind === 'insertion' ? 'inserted' : 'deleted'} "${quoteText(change.text)}"`,
        ),
      ),
    );
  }

  lines.push(
    `${count(threads.length, 'thread')}: ${String(threads.length - resolved)} open, ${String(resolved)} resolved.`,
  );
  if (orphaned > 0) lines.push(`${String(orphaned)} not placed on a block of ${reviewed}.`);
  if (inspection.sourceChanged === true)
    lines.push(`${reviewed} has changed since the file was built.`);
  if (typeof edits === 'string') lines.push(`Edits not checked: ${edits}.`);
  else if (edits.length > 0)
    lines.push(`${count(edits.length, 'change')} to the text found in the file, not applied.`);
  if (review.trackedChanges.length > 0) {
    lines.push(
      `${count(review.trackedChanges.length, 'tracked change')} in the file, not applied.`,
    );
  }
  return {
    document: { meta: { title: `Review of ${title}`, reviews: reviewed, fields: {} }, blocks },
    lines,
  };
}

/**
 * Pulls the comments of a reviewed DOCX into a new review document (ADR 0084): it never changes
 * the reviewed document or an earlier review, and never applies a change found in the file.
 */
export async function pullReview(
  storage: ProjectStorage,
  bytes: Uint8Array,
  options: PullReviewOptions,
): Promise<PullReviewResult> {
  const loaded = await loadProject(storage);
  const { settings, stylesheet } = loaded;
  if (settings === undefined || stylesheet === undefined) {
    return { ok: false, reason: 'no-project', message: NO_PROJECT_MESSAGE };
  }
  const read = readReview(bytes);
  if (!read.ok) return read;
  const review = read.review;

  const stamped = review.stamp?.document;
  let current: string | undefined;
  if (stamped !== undefined) {
    try {
      current = await storage.readText(stamped);
    } catch {
      current = undefined;
    }
  }
  const inspection = inspectReview(loaded, review, (path) =>
    path === stamped ? current : undefined,
  );
  const reviewed = inspection.document;
  if (reviewed === undefined) {
    return {
      ok: false,
      reason: 'not-in-project',
      message:
        'The file has no revision stamp and no bookmark of a block of this project, so it is not a document of this project.',
    };
  }

  const source = await reviewedSource(review, options);
  let edits: Edit[] | string;
  if (source.text === undefined) {
    edits = source.why;
  } else {
    const built = await builtParagraphs(loaded, reviewed, source.text);
    edits = typeof built === 'string' ? built : editsBetween(built, review.paragraphs);
  }
  const built = reviewDocument(
    loaded,
    review,
    inspection,
    reviewed,
    options.fileName,
    edits,
    source.text === undefined ? undefined : source.from,
  );

  const before = pulledBefore(loaded, reviewed);
  // A review document names each thread by the Word comment that starts it.
  const ids = new Set(
    threadsOf(review.comments).flatMap(([top]) =>
      top.durableId === undefined ? [] : [top.durableId],
    ),
  );
  for (const [path, earlier] of before) {
    const repeated = [...ids].filter((id) => earlier.has(id)).length;
    if (repeated > 0) {
      built.lines.push(
        `${String(repeated)} of ${count(ids.size, 'thread')} ${repeated === 1 ? 'is' : 'are'} also in ${path}.`,
      );
    }
  }

  const name = reviewed.split('/').pop()?.slice(0, -DOCUMENT_SUFFIX.length) ?? 'review';
  const day = review.savedAt?.slice(0, 10) ?? 'undated';
  const stored = await storeNewDocument(
    storage,
    { settings, stylesheet, documents: loaded.documents },
    built.document,
    `${name}-${/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'undated'}`,
    options.randomBytes,
    { directory: REVIEWS_DIR, list: false, verbatimName: true },
  );
  if (!stored.ok) return stored;
  return {
    ok: true,
    document: stored.document,
    reviewed,
    lines: built.lines,
    diagnostics: stored.diagnostics,
  };
}
