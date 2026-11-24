import type { Block } from '@stanza/core';
import { readReview } from '@stanza/import-docx';
import { DOCUMENT_SUFFIX } from './files.js';
import { documentBytes } from './export-document.js';
import { hasErrors, type ProjectDiagnostic } from './diagnostics.js';
import type { BuildOptions } from './build.js';
import type { LoadedProject } from './load.js';
import { inspectReview } from './review.js';
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

/** Why the file that is there may not be replaced, or undefined when it may. */
function checkExisting(
  loaded: LoadedProject,
  documentPath: string,
  existing: ExistingFile,
): Omit<Refusal, 'ok' | 'diagnostics'> | undefined {
  const force = 'or push with --force to replace it';
  const read = readReview(existing.bytes);
  if (!read.ok) {
    return {
      reason: 'not-a-document',
      message: `${existing.name} is there and is not a DOCX that can be read (${read.message}) Choose another destination, ${force}.`,
    };
  }
  const review = read.review;
  const document = inspectReview(loaded, review, () => undefined).document;
  if (document === undefined) {
    return {
      reason: 'not-of-project',
      message: `${existing.name} is there and is not a document of this project. Choose another destination, ${force}.`,
    };
  }
  if (document !== documentPath) {
    return {
      reason: 'other-document',
      message: `${existing.name} is there and was built from ${document}, not ${documentPath}. Choose another destination, ${force}.`,
    };
  }
  const created = review.createdAt === undefined ? undefined : Date.parse(review.createdAt);
  const saved = review.savedAt === undefined ? undefined : Date.parse(review.savedAt);
  // The exporter writes one time as both; a save in Word changes only the modified time.
  if (created === undefined || saved === undefined || created === saved) return undefined;
  const savedMinute = minuteOf(review.savedAt ?? '');
  const pulled = latestPull(loaded, documentPath);
  if (savedMinute !== undefined && pulled !== undefined && pulled >= savedMinute) return undefined;
  const comments = review.comments.length;
  const holding =
    comments === 0
      ? 'It has no comments, but may have changes.'
      : `It has ${String(comments)} ${comments === 1 ? 'comment' : 'comments'}.`;
  return {
    reason: 'unpulled',
    message: `${existing.name} was saved in Word on ${savedMinute ?? 'an unknown time'} UTC, after it was pushed, and that version has not been pulled. ${holding} Pull it first (stanza review pull), ${force}.`,
  };
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
    const refusal = checkExisting(loaded, documentPath, existing);
    if (refusal !== undefined) return { ok: false, ...refusal, diagnostics: made.diagnostics };
  }
  return {
    ok: true,
    bytes: made.bytes,
    replaces: existing !== undefined,
    diagnostics: made.diagnostics,
  };
}
