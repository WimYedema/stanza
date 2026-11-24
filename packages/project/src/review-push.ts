import { contentHash, type Block } from '@stanza/core';
import { readReview } from '@stanza/import-docx';
import { DOCUMENT_SUFFIX } from './files.js';
import { documentBytes } from './export-document.js';
import { hasErrors, type ProjectDiagnostic } from './diagnostics.js';
import type { BuildOptions } from './build.js';
import type { LoadedProject } from './load.js';
import { inspectReview } from './review.js';
import { latestThreads, reviewThreads } from './review-threads.js';
import type { ProjectStorage } from './storage.js';

/**
 * Pushing a document for review (ADR 0088): the DOCX of one document, made as a build makes it,
 * for a destination outside the project. A file that is there is replaced, unless it was saved in
 * Word since it was pushed and that save was not pulled, or it is not of this document.
 */

export interface PushOptions extends Omit<BuildOptions, 'outDir'> {
  /** Replace the file that is there whatever it holds. */
  readonly force?: boolean;
}

/** The file that is at the destination, by the name the messages use. */
export interface ExistingFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export type PushResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      /** Whether a file that was there is replaced. */
      readonly replaces: boolean;
      /**
       * What leaves the file with the push: the comments in the file it replaces, which are not
       * carried into the new one (ADR 0088), and how many threads of the review documents of the
       * document are still open, which is where those comments stay.
       */
      readonly removes: { readonly comments: number; readonly openThreads: number };
      readonly diagnostics: readonly ProjectDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly reason:
        'blocked' | 'errors' | 'unpulled' | 'other-document' | 'not-of-project' | 'not-a-document';
      readonly message: string;
      readonly diagnostics: readonly ProjectDiagnostic[];
    };

/** The name of the file of a document in a review folder, as in `build/`: `<name>.docx`. */
export function pushFileName(documentPath: string): string {
  const base = documentPath.split('/').pop() ?? documentPath;
  return `${base.endsWith(DOCUMENT_SUFFIX) ? base.slice(0, -DOCUMENT_SUFFIX.length) : base}.docx`;
}

/**
 * The name of a new file for `--new`: `<name>-<day>.docx`, with a number when that is taken, as
 * `<name>-<day>-2.docx`.
 */
export function newPushFileName(
  documentPath: string,
  day: string,
  taken: (name: string) => boolean,
): string {
  const stem = `${pushFileName(documentPath).slice(0, -'.docx'.length)}-${day}`;
  let name = `${stem}.docx`;
  for (let number = 2; taken(name); number++) name = `${stem}-${String(number)}.docx`;
  return name;
}

const plain = (block: Block | undefined): string =>
  block?.type === 'paragraph' ? block.content.map((inline) => inline.text).join('') : '';

/** The minute as a review document writes the time of the last save: `2026-11-24 17:37`. */
const minuteOf = (time: string): string | undefined => {
  const at = Date.parse(time);
  return Number.isNaN(at) ? undefined : new Date(at).toISOString().slice(0, 16).replace('T', ' ');
};

/**
 * The latest save of a reviewed file that a review document of the document was pulled from, by
 * the opening paragraph that `review pull` writes (ADR 0084).
 */
function latestPull(loaded: LoadedProject, documentPath: string): string | undefined {
  let latest: string | undefined;
  for (const { document } of loaded.documents) {
    if (document.meta.reviews !== documentPath) continue;
    const opening = plain(document.blocks.find((block) => block.type === 'paragraph'));
    const saved = /\blast saved (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC\b/.exec(opening)?.[1];
    if (saved !== undefined && (latest === undefined || saved > latest)) latest = saved;
  }
  return latest;
}

type Refusal = Extract<PushResult, { ok: false }>;

/** What the file that is there is, against the document. */
interface FileCheck {
  /** Why it may not be replaced, or undefined when it may. */
  readonly refusal?: Omit<Refusal, 'ok' | 'diagnostics'>;
  /** For a file of the document that was saved and not pulled: its comments and when. */
  readonly unpulled?: { readonly comments: number; readonly savedAt: string };
  /** The content hash of the source the file was built from, by its stamp. */
  readonly contentHash?: string;
}

function checkExisting(
  loaded: LoadedProject,
  documentPath: string,
  existing: ExistingFile,
): FileCheck {
  const force = 'or push with --force to replace it';
  const read = readReview(existing.bytes);
  if (!read.ok) {
    return {
      refusal: {
        reason: 'not-a-document',
        message: `${existing.name} is there and is not a DOCX that can be read (${read.message}) Choose another destination, ${force}.`,
      },
    };
  }
  const review = read.review;
  const document = inspectReview(loaded, review, () => undefined).document;
  if (document === undefined) {
    return {
      refusal: {
        reason: 'not-of-project',
        message: `${existing.name} is there and is not a document of this project. Choose another destination, ${force}.`,
      },
    };
  }
  if (document !== documentPath) {
    return {
      refusal: {
        reason: 'other-document',
        message: `${existing.name} is there and was built from ${document}, not ${documentPath}. Choose another destination, ${force}.`,
      },
    };
  }
  const hash = review.stamp?.contentHash;
  const ours: FileCheck = hash === undefined ? {} : { contentHash: hash };
  const created = review.createdAt === undefined ? undefined : Date.parse(review.createdAt);
  const saved = review.savedAt === undefined ? undefined : Date.parse(review.savedAt);
  // The exporter writes one time as both; a save in Word changes only the modified time.
  if (created === undefined || saved === undefined || created === saved) return ours;
  const savedMinute = minuteOf(review.savedAt ?? '');
  const pulled = latestPull(loaded, documentPath);
  if (savedMinute !== undefined && pulled !== undefined && pulled >= savedMinute) return ours;
  const comments = review.comments.length;
  const holding =
    comments === 0
      ? 'It has no comments, but may have changes.'
      : `It has ${String(comments)} ${comments === 1 ? 'comment' : 'comments'}.`;
  return {
    ...ours,
    refusal: {
      reason: 'unpulled',
      message: `${existing.name} was saved in Word on ${savedMinute ?? 'an unknown time'} UTC, after it was pushed, and that version has not been pulled. ${holding} Pull it first (stanza review pull), ${force}.`,
    },
    unpulled: { comments, savedAt: savedMinute ?? '' },
  };
}

/** Where the review round of a document stands, by the file in its review folder (ADR 0088). */
export type ReviewRoundStatus =
  /** There is no file in the folder. */
  | { readonly kind: 'not-pushed' }
  /** The file there is not of this document, or cannot be read. */
  | { readonly kind: 'not-this-document'; readonly message: string }
  /** Reviewers saved the file since it was pushed, and that save was not pulled. */
  | { readonly kind: 'unpulled'; readonly comments: number; readonly savedAt: string }
  /** The document changed since the version that the file was built from. */
  | { readonly kind: 'changed' }
  /** The file holds the document as it is, and nothing came back that was not pulled. */
  | { readonly kind: 'current' };

/**
 * Where the review round of a document stands: the file in its review folder, if there is one,
 * against the review documents of the project and the current source of the document.
 */
export function reviewRoundStatus(
  loaded: LoadedProject,
  documentPath: string,
  existing: ExistingFile | undefined,
  source: string,
): ReviewRoundStatus {
  if (existing === undefined) return { kind: 'not-pushed' };
  const check = checkExisting(loaded, documentPath, existing);
  if (check.unpulled !== undefined) return { kind: 'unpulled', ...check.unpulled };
  if (check.refusal !== undefined)
    return { kind: 'not-this-document', message: check.refusal.message };
  return check.contentHash === contentHash(source) ? { kind: 'current' } : { kind: 'changed' };
}

/**
 * The DOCX of a document to push for review (ADR 0088), checked against the file that is at the
 * destination, if any. The host reads that file and writes the result; nothing is written here.
 */
export async function pushReview(
  storage: ProjectStorage,
  loaded: LoadedProject,
  documentPath: string,
  existing: ExistingFile | undefined,
  options: PushOptions,
): Promise<PushResult> {
  const made = await documentBytes(storage, loaded, documentPath, options);
  if (made.blocked) {
    return {
      ok: false,
      reason: 'blocked',
      message: loaded.documents.some((entry) => entry.path === documentPath)
        ? `${documentPath} cannot be pushed while the project file, the stylesheet or the document has errors.`
        : `${documentPath} is not a document of this project.`,
      diagnostics: made.diagnostics,
    };
  }
  if (made.bytes === undefined || hasErrors(made.diagnostics)) {
    return {
      ok: false,
      reason: 'errors',
      message: `${documentPath} has errors, so it was not pushed.`,
      diagnostics: made.diagnostics,
    };
  }
  if (existing !== undefined && options.force !== true) {
    const { refusal } = checkExisting(loaded, documentPath, existing);
    if (refusal !== undefined) return { ok: false, ...refusal, diagnostics: made.diagnostics };
  }
  return {
    ok: true,
    bytes: made.bytes,
    replaces: existing !== undefined,
    removes: {
      comments: existing === undefined ? 0 : commentsIn(existing.bytes),
      openThreads: openThreads(loaded, documentPath),
    },
    diagnostics: made.diagnostics,
  };
}

/** How many comments a file holds; none when it cannot be read. */
function commentsIn(bytes: Uint8Array): number {
  const read = readReview(bytes);
  return read.ok ? read.review.comments.length : 0;
}

/** The open threads of the review documents of a document, a Word comment pulled twice once. */
export function openThreads(loaded: LoadedProject, documentPath: string): number {
  const threads = loaded.documents
    .filter((entry) => entry.document.meta.reviews === documentPath)
    .flatMap((entry) => reviewThreads(entry.path, entry.document));
  return latestThreads(threads).filter((thread) => thread.status === 'open').length;
}

/**
 * What a push says about the comments it takes out of the file (ADR 0088), or undefined when the
 * file it replaces had none: they are not carried into the new file, and stay in the review
 * documents.
 */
export function removedCommentsNote(
  fileName: string,
  removes: { readonly comments: number; readonly openThreads: number },
): string | undefined {
  if (removes.comments === 0) return undefined;
  const comments = `${String(removes.comments)} ${removes.comments === 1 ? 'comment' : 'comments'}`;
  const open =
    removes.openThreads === 0
      ? 'none of their threads is open'
      : `${String(removes.openThreads)} ${removes.openThreads === 1 ? 'thread is' : 'threads are'} still open`;
  return `${fileName} had ${comments}. The new file is a clean copy of the document, so they are no longer in it; they stay in the review documents, where ${open}.`;
}
