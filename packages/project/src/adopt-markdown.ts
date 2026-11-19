import { adoptMarkdown, type AdoptReport } from '@phrase/format';
import type { ProjectDiagnostic } from './diagnostics.js';
import type { ProjectStorage } from './storage.js';
import { NO_PROJECT_MESSAGE, loadOrderedProject, storeNewDocument } from './store-document.js';

export interface AdoptMarkdownOptions {
  /** The name of the Markdown file without its extension, from which the file name is made. */
  readonly name: string;
  /** The host supplies the random bytes, since `core` has none. */
  readonly randomBytes: () => Uint8Array;
}

export type AdoptMarkdownResult =
  | {
      readonly ok: true;
      /** The new document, relative to the project root. */
      readonly document: string;
      /** How many IDs were given to headings and tables. */
      readonly assigned: number;
      readonly report: AdoptReport;
      /** What checking the new document against the project found. */
      readonly diagnostics: readonly ProjectDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly reason: 'no-project' | 'already-phrase' | 'no-ids';
      readonly message: string;
    };

/**
 * Adopts an ordinary Markdown file as one new document of a project (ADR 0060). The project must
 * be in order. The original is unchanged, and a taken name gets a number. An explicit project
 * document list gets the new path appended.
 */
export async function adoptMarkdownDocument(
  storage: ProjectStorage,
  source: string,
  options: AdoptMarkdownOptions,
): Promise<AdoptMarkdownResult> {
  const project = await loadOrderedProject(storage);
  if (project === undefined) {
    return { ok: false, reason: 'no-project', message: NO_PROJECT_MESSAGE };
  }
  const adopted = adoptMarkdown(source);
  if (!adopted.ok) return adopted;

  const name = options.name.trim().replace(/\s+/g, ' ');
  const title = adopted.document.meta.title ?? (name === '' ? 'Adopted document' : name);
  const content = { ...adopted.document, meta: { ...adopted.document.meta, title } };
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
    report: adopted.report,
    diagnostics: stored.diagnostics,
  };
}
