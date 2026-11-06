import { nodeIdFromRandomBytes } from '@phrase/core';
import { DOCUMENT_SUFFIX } from './files.js';
import { firstDocument, names, slugOf, type NewProjectOptions } from './new-project.js';
import type { ProjectStorage } from './storage.js';

export type NewDocumentOptions = NewProjectOptions;

export type NewDocumentResult =
  | { readonly ok: true; readonly document: string }
  | { readonly ok: false; readonly reason: 'empty-title' }
  | { readonly ok: false; readonly reason: 'exists'; readonly existing: string };

const DOCUMENTS_DIR = 'documents';

/**
 * Adds a document to a project, next to the first one (ADR 0044). It writes nothing when a file
 * of that name exists already.
 */
export async function addDocument(
  storage: ProjectStorage,
  options: NewDocumentOptions,
): Promise<NewDocumentResult> {
  const title = options.title.trim().replace(/\s+/g, ' ');
  if (title === '') return { ok: false, reason: 'empty-title' };

  const name = `${slugOf(title)}${DOCUMENT_SUFFIX}`;
  const document = `${DOCUMENTS_DIR}/${name}`;
  if ((await names(storage, DOCUMENTS_DIR)).includes(name)) {
    return { ok: false, reason: 'exists', existing: document };
  }
  await storage.writeText(
    document,
    firstDocument(title, nodeIdFromRandomBytes(options.randomBytes())),
  );
  return { ok: true, document };
}
