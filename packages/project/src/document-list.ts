import { editDocumentList, parseProject, type DocumentListEdit } from '@phrase/format';
import { findDocuments, PROJECT_FILE } from './files.js';
import type { ProjectStorage } from './storage.js';

export interface DocumentListPlan {
  readonly before: string;
  readonly after: string;
}

/** Preflight before creating a document, so invalid configuration cannot leave an unlisted file. */
export async function planDocumentAppend(
  storage: ProjectStorage,
  path: string,
): Promise<DocumentListPlan> {
  const before = await storage.readText(PROJECT_FILE);
  const parsed = parseProject(before);
  if (parsed.diagnostics.some((d) => d.severity === 'error')) {
    throw new Error('Fix the errors in phrase.yaml before adding a document.');
  }
  if (parsed.settings.documents === undefined) return { before, after: before };
  const edit = editDocumentList(before, { kind: 'append', path });
  if (!edit.ok) throw new Error(edit.message);
  return { before, after: edit.text };
}

export async function applyDocumentListPlan(
  storage: ProjectStorage,
  plan: DocumentListPlan,
): Promise<void> {
  if (plan.before === plan.after) return;
  if ((await storage.readText(PROJECT_FILE)) !== plan.before) {
    throw new Error(
      'phrase.yaml changed while updating its document list. Any new file may exist; check its entry before retrying.',
    );
  }
  try {
    await storage.writeText(PROJECT_FILE, plan.after);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The document list could not be updated. The new file may exist; check its entry before retrying. ${reason}`,
      { cause: error },
    );
  }
}

/** Captures the same deterministic discovery order used when the outline is implicit. */
export async function initializeDocumentList(storage: ProjectStorage): Promise<DocumentListEdit> {
  const before = await storage.readText(PROJECT_FILE);
  const edit = editDocumentList(before, {
    kind: 'initialize',
    paths: await findDocuments(storage),
  });
  if (edit.ok) await applyDocumentListPlan(storage, { before, after: edit.text });
  return edit;
}
