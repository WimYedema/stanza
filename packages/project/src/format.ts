import {
  assignMissingIds,
  collectBlockIds,
  fixReferencePaths,
  indexProjectReferences,
  isSafeRelativePath,
  type Document,
} from '@phrase/core';
import { parseDocument, serializeDocument, type ParseResult } from '@phrase/format';
import { inFile, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX, findDocuments, readText } from './files.js';
import type { ProjectStorage } from './storage.js';

export interface FormatOptions {
  /** Report what would change and write nothing. */
  readonly check: boolean;
  /** Only rewrite these project-relative documents, while reserving all given documents' IDs. */
  readonly files?: readonly string[];
  readonly fixReferences?: boolean;
  /**
   * With it, headings and tables without an ID get one (ADR 0020). It is the host's random source,
   * since this package has none, and a candidate that is already taken is not used.
   */
  readonly generateId?: () => string;
}

export type FormatStatus =
  /** Already canonical. */
  | 'unchanged'
  /** Was not canonical: written, or only reported when checking. */
  | 'changed'
  /** Has constructs the model cannot hold, so rewriting it would lose content. */
  | 'refused';

export interface FormatResult {
  readonly files: readonly {
    readonly path: string;
    readonly status: FormatStatus;
    /** The IDs that were added, or with `check` that are missing. */
    readonly assigned: number;
  }[];
  /** The parse diagnostics of refused files, and files that could not be read. */
  readonly diagnostics: readonly ProjectDiagnostic[];
}

/** The parser reads LF, and a BOM is not content. */
const normalized = (text: string): string => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

interface Read {
  readonly path: string;
  readonly text: string;
  readonly parsed: ParseResult;
}

/**
 * Rewrites the given documents in canonical form: a file is canonical when parsing and serializing
 * it gives the same text (ADR 0003). A document with any parse diagnostic holds something the
 * model cannot keep, so it is reported and left as it is (ADR 0015). With `generateId`, missing
 * IDs are added as well, unique across all the given documents (ADR 0020).
 */
export async function formatDocuments(
  storage: ProjectStorage,
  paths: readonly string[],
  options: FormatOptions,
): Promise<FormatResult> {
  const diagnostics: ProjectDiagnostic[] = [];
  const selected = options.files === undefined ? undefined : new Set(options.files);
  if (selected !== undefined) {
    for (const file of selected) {
      if (!isSafeRelativePath(file) || !file.endsWith(DOCUMENT_SUFFIX) || !paths.includes(file)) {
        diagnostics.push({
          file,
          severity: 'error',
          code: 'invalid-selection',
          message: 'Select an existing .phrase.md document inside this project.',
        });
      }
    }
    if (diagnostics.length > 0) return { files: [], diagnostics };
  }
  const documents: Read[] = [];
  let unreadable: string | undefined;
  for (const path of paths) {
    if (
      selected !== undefined &&
      !selected.has(path) &&
      options.generateId === undefined &&
      !options.fixReferences
    )
      continue;
    const text = await readText(storage, path, diagnostics);
    if (text === undefined) unreadable ??= path;
    else documents.push({ path, text, parsed: parseDocument(normalized(text)) });
  }

  // Without every document there is no telling which IDs are taken.
  const generate = unreadable === undefined ? options.generateId : undefined;
  if (unreadable !== undefined && options.generateId !== undefined) {
    diagnostics.push({
      file: unreadable,
      severity: 'error',
      code: 'ids-not-assigned',
      message: 'No IDs were assigned, because a document could not be read.',
    });
  }
  // The refused documents are read too, so that their IDs are not given out again.
  const used = new Set<string>(
    generate === undefined
      ? []
      : documents.flatMap(({ parsed }) => collectBlockIds(parsed.document).map((b) => b.id)),
  );

  const files: { path: string; status: FormatStatus; assigned: number }[] = [];
  const references = options.fixReferences
    ? indexProjectReferences(
        documents.map(({ path, parsed }) => ({ file: path, document: parsed.document })),
      )
    : undefined;
  const unreliable =
    unreadable ?? documents.find(({ parsed }) => parsed.diagnostics.length > 0)?.path;
  if (options.fixReferences && unreliable !== undefined) {
    for (const { path, parsed } of documents) diagnostics.push(...inFile(path, parsed.diagnostics));
    diagnostics.push({
      file: unreliable,
      severity: 'error',
      code: 'references-not-fixed',
      message:
        'No reference paths were fixed because a project document could not be read without losing content.',
    });
    return { files: [], diagnostics };
  }
  if (references !== undefined && references.duplicates.size > 0) {
    for (const [id, target] of references.targets) {
      if (references.duplicates.has(id))
        diagnostics.push({
          file: target.file,
          severity: 'error',
          code: 'duplicate-id',
          nodeId: id,
          message: `The ID ${id} is duplicated; resolve duplicate IDs before fixing reference paths.`,
        });
    }
    return { files: [], diagnostics };
  }
  for (const { path, text, parsed } of documents) {
    if (selected !== undefined && !selected.has(path)) continue;
    if (parsed.diagnostics.length > 0) {
      diagnostics.push(...inFile(path, parsed.diagnostics));
      files.push({ path, status: 'refused', assigned: 0 });
      continue;
    }
    let document: Document =
      references === undefined
        ? parsed.document
        : fixReferencePaths(parsed.document, path, references);
    let assigned = 0;
    if (generate !== undefined) {
      const result = assignMissingIds(document, { used, generate });
      diagnostics.push(...inFile(path, result.diagnostics));
      // A document that ran out of candidates is left as it is, not half done.
      if (result.diagnostics.some((d) => d.code === 'id-generation-failed')) {
        files.push({ path, status: 'refused', assigned: 0 });
        continue;
      }
      for (const id of result.assigned) used.add(id);
      document = result.document;
      assigned = result.assigned.length;
    }
    const output = serializeDocument(document);
    if (output === text) {
      files.push({ path, status: 'unchanged', assigned });
    } else {
      if (!options.check) await storage.writeText(path, output);
      files.push({ path, status: 'changed', assigned });
    }
  }
  return { files, diagnostics };
}

/** Formats project documents, or the selected ones. The project file need not be in order. */
export async function formatProject(
  storage: ProjectStorage,
  options: FormatOptions,
): Promise<FormatResult> {
  return formatDocuments(storage, await findDocuments(storage), options);
}
