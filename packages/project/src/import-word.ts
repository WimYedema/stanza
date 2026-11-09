import {
  assignMissingIds,
  collectBlockIds,
  nodeIdFromRandomBytes,
  type Document,
} from '@phrase/core';
import { checkDocumentText, serializeDocument } from '@phrase/format';
import { importDocx, type ImportReport } from '@phrase/import-docx';
import { inFile, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX } from './files.js';
import { loadProject } from './load.js';
import { names, slugOf } from './new-project.js';
import type { ProjectStorage } from './storage.js';

export interface ImportWordOptions {
  /** The name of the Word file without its extension, from which the file name is made. */
  readonly name: string;
  /** The host supplies the random bytes, since `core` has none. */
  readonly randomBytes: () => Uint8Array;
}

export type ImportWordResult =
  | {
      readonly ok: true;
      /** The new document, relative to the project root. */
      readonly document: string;
      /** How many IDs were given to headings and tables. */
      readonly assigned: number;
      readonly report: ImportReport;
      /** What checking the new document against the project found. */
      readonly diagnostics: readonly ProjectDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly reason: 'no-project' | 'not-a-docx' | 'unreadable' | 'no-ids';
      readonly message: string;
    };

const DOCUMENTS_DIR = 'documents';

/** The first name that is free in the documents folder: `a`, then `a-2`, `a-3`. */
function freeName(base: string, taken: ReadonlySet<string>): string {
  for (let number = 1; ; number += 1) {
    const candidate = number === 1 ? base : `${base}-${String(number)}`;
    if (!taken.has(`${candidate}${DOCUMENT_SUFFIX}`)) return candidate;
  }
}

/**
 * Imports a Word document as one new document of a project (ADR 0047). The project must be in
 * order, since the new IDs have to be unique across it. Nothing existing is changed: a name that
 * is taken gets a number.
 */
export async function importWordDocument(
  storage: ProjectStorage,
  bytes: Uint8Array,
  options: ImportWordOptions,
): Promise<ImportWordResult> {
  const loaded = await loadProject(storage);
  const { settings, stylesheet } = loaded;
  if (settings === undefined || stylesheet === undefined) {
    return {
      ok: false,
      reason: 'no-project',
      message:
        'The folder has no project in order. Fix the project file and the stylesheet first (see "phrase validate").',
    };
  }
  const imported = importDocx(bytes);
  if (!imported.ok) return imported;

  const name = options.name.trim().replace(/\s+/g, ' ');
  const title = imported.document.meta.title ?? (name === '' ? 'Imported document' : name);
  const content: Document = { ...imported.document, meta: { ...imported.document.meta, title } };
  const used = new Set<string>(
    loaded.documents.flatMap(({ document }) => collectBlockIds(document).map((b) => b.id)),
  );
  const withIds = assignMissingIds(content, {
    used,
    generate: () => nodeIdFromRandomBytes(options.randomBytes()),
  });
  if (withIds.diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, reason: 'no-ids', message: 'No unused ID could be made for a heading.' };
  }

  const taken = new Set(await names(storage, DOCUMENTS_DIR));
  const path = `${DOCUMENTS_DIR}/${freeName(slugOf(name === '' ? title : name), taken)}${DOCUMENT_SUFFIX}`;
  const text = serializeDocument(withIds.document);
  await storage.writeText(path, text);
  return {
    ok: true,
    document: path,
    assigned: withIds.assigned.length,
    report: imported.report,
    diagnostics: inFile(path, checkDocumentText(text, stylesheet, settings).diagnostics),
  };
}

/** The report of an import as lines of text, for the command line and the extension. */
export function describeImport(report: ImportReport): readonly string[] {
  const lines = report.diagnostics.map((d) => {
    const times = d.count === 1 ? '' : ` (${String(d.count)} times)`;
    const places = d.places.length === 0 ? '' : ` Where: ${d.places.join('; ')}.`;
    return `${d.severity}: ${d.message}${times}${places}`;
  });
  if (report.styles.length > 0) {
    const styles = report.styles.map((s) => `${s.word} as ${s.as} (${String(s.count)})`);
    lines.push(`Word styles used: ${styles.join(', ')}.`);
  }
  return lines;
}
