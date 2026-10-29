import { parseDocument, serializeDocument } from '@phrase/format';
import { inFile, type ProjectDiagnostic } from './diagnostics.js';
import { findDocuments, readText } from './files.js';
import type { ProjectStorage } from './storage.js';

export interface FormatOptions {
  /** Report what would change and write nothing. */
  readonly check: boolean;
}

export type FormatStatus =
  /** Already canonical. */
  | 'unchanged'
  /** Was not canonical: written, or only reported when checking. */
  | 'changed'
  /** Has constructs the model cannot hold, so rewriting it would lose content. */
  | 'refused';

export interface FormatResult {
  readonly files: readonly { readonly path: string; readonly status: FormatStatus }[];
  /** The parse diagnostics of refused files, and files that could not be read. */
  readonly diagnostics: readonly ProjectDiagnostic[];
}

/** The parser reads LF, and a BOM is not content. */
const normalized = (text: string): string => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

/**
 * Rewrites the given documents in canonical form: a file is canonical when parsing and serializing
 * it gives the same text (ADR 0003). A document with any parse diagnostic holds something the
 * model cannot keep, so it is reported and left as it is (ADR 0015).
 */
export async function formatDocuments(
  storage: ProjectStorage,
  paths: readonly string[],
  options: FormatOptions,
): Promise<FormatResult> {
  const diagnostics: ProjectDiagnostic[] = [];
  const files: { path: string; status: FormatStatus }[] = [];
  for (const path of paths) {
    const text = await readText(storage, path, diagnostics);
    if (text === undefined) continue;
    const parsed = parseDocument(normalized(text));
    if (parsed.diagnostics.length > 0) {
      diagnostics.push(...inFile(path, parsed.diagnostics));
      files.push({ path, status: 'refused' });
      continue;
    }
    const output = serializeDocument(parsed.document);
    if (output === text) {
      files.push({ path, status: 'unchanged' });
    } else {
      if (!options.check) await storage.writeText(path, output);
      files.push({ path, status: 'changed' });
    }
  }
  return { files, diagnostics };
}

/** Formats every document of the project. The project file need not be in order. */
export async function formatProject(
  storage: ProjectStorage,
  options: FormatOptions,
): Promise<FormatResult> {
  return formatDocuments(storage, await findDocuments(storage), options);
}
