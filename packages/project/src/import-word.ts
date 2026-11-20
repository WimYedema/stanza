import type { Document } from '@stanza/core';
import { importDocx, type ImportReport } from '@stanza/import-docx';
import type { ProjectDiagnostic } from './diagnostics.js';
import type { ProjectStorage } from './storage.js';
import { NO_PROJECT_MESSAGE, loadOrderedProject, storeNewDocument } from './store-document.js';

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

/**
 * Imports a Word document as one new document of a project (ADR 0047). The project must be in
 * order, since the new IDs have to be unique across it. A taken name gets a number; an explicit
 * project document list gets the new path appended.
 */
export async function importWordDocument(
  storage: ProjectStorage,
  bytes: Uint8Array,
  options: ImportWordOptions,
): Promise<ImportWordResult> {
  const project = await loadOrderedProject(storage);
  if (project === undefined) {
    return { ok: false, reason: 'no-project', message: NO_PROJECT_MESSAGE };
  }
  const imported = importDocx(bytes);
  if (!imported.ok) return imported;

  const name = options.name.trim().replace(/\s+/g, ' ');
  const title = imported.document.meta.title ?? (name === '' ? 'Imported document' : name);
  const content: Document = { ...imported.document, meta: { ...imported.document.meta, title } };
  const stored = await storeNewDocument(
    storage,
    project,
    content,
    name === '' ? title : name,
    options.randomBytes,
  );
  if (!stored.ok) return stored;
  return {
    ok: true,
    document: stored.document,
    assigned: stored.assigned,
    report: imported.report,
    diagnostics: stored.diagnostics,
  };
}

/** A report of an import or an adoption: findings with counts and places, and maybe styles. */
export interface ReportLines {
  readonly diagnostics: readonly {
    readonly severity: string;
    readonly code: string;
    readonly message: string;
    readonly count: number;
    readonly places: readonly string[];
  }[];
  readonly styles?: ImportReport['styles'];
}

/** The report of an import as lines of text, for the command line and the extension. */
export function describeImport(report: ReportLines): readonly string[] {
  const lines = report.diagnostics.map((d) => {
    const times = d.count === 1 ? '' : ` (${String(d.count)} times)`;
    const places = d.places.length === 0 ? '' : ` Where: ${d.places.join('; ')}.`;
    return `${d.severity}: ${d.message}${times}${places}`;
  });
  if (report.styles !== undefined && report.styles.length > 0) {
    const styles = report.styles.map((s) => `${s.word} as ${s.as} (${String(s.count)})`);
    lines.push(`Word styles used: ${styles.join(', ')}.`);
  }
  return lines;
}
