import {
  assignMissingIds,
  collectBlockIds,
  nodeIdFromRandomBytes,
  projectIds,
  type Document,
  type ProjectSettings,
  type Stylesheet,
} from '@stanza/core';
import { checkDocumentText, serializeDocument } from '@stanza/format';
import { inFile, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX } from './files.js';
import { loadProject, type LoadedProject } from './load.js';
import { names, slugOf } from './new-project.js';
import type { ProjectStorage } from './storage.js';
import { applyDocumentListPlan, planDocumentAppend } from './document-list.js';

/** A project whose file and stylesheet load without errors. */
export interface OrderedProject {
  readonly settings: ProjectSettings;
  readonly stylesheet: Stylesheet;
  readonly documents: LoadedProject['documents'];
}

export const NO_PROJECT_MESSAGE =
  'The folder has no project in order. Fix the project file and the stylesheet first (see "stanza validate").';

/** The project, or undefined when its file or stylesheet is not in order. */
export async function loadOrderedProject(
  storage: ProjectStorage,
): Promise<OrderedProject | undefined> {
  const { settings, stylesheet, documents } = await loadProject(storage);
  return settings === undefined || stylesheet === undefined
    ? undefined
    : { settings, stylesheet, documents };
}

const DOCUMENTS_DIR = 'documents';

/** The first name that is free in the documents folder: `a`, then `a-2`, `a-3`. */
function freeName(base: string, taken: ReadonlySet<string>): string {
  for (let number = 1; ; number += 1) {
    const candidate = number === 1 ? base : `${base}-${String(number)}`;
    if (!taken.has(`${candidate}${DOCUMENT_SUFFIX}`)) return candidate;
  }
}

/** Where a new document goes: a folder of the project, and whether the document list gets it. */
export interface StorePlacement {
  /** The default is `documents`. */
  readonly directory?: string;
  /** False leaves the document list as it is; the default appends to an explicit one. */
  readonly list?: boolean;
  /** True takes `name` as the file name as it is, instead of making one from a title. */
  readonly verbatimName?: boolean;
}

export type StoredDocument =
  | {
      readonly ok: true;
      /** The new document, relative to the project root. */
      readonly document: string;
      /** How many IDs were given to headings and tables. */
      readonly assigned: number;
      /** What checking the new document against the project found. */
      readonly diagnostics: readonly ProjectDiagnostic[];
    }
  | { readonly ok: false; readonly reason: 'no-ids'; readonly message: string };

/**
 * Writes the content of a file that was brought in from outside (ADR 0047, 0060) as a new document:
 * a free name made from `name`, new IDs that are unused in the project, the canonical text, and the
 * checks of the project afterwards. An explicit document list gets the new path appended.
 */
export async function storeNewDocument(
  storage: ProjectStorage,
  project: OrderedProject,
  content: Document,
  name: string,
  randomBytes: () => Uint8Array,
  placement: StorePlacement = {},
): Promise<StoredDocument> {
  const directory = placement.directory ?? DOCUMENTS_DIR;
  const used = new Set<string>(
    project.documents.flatMap(({ document }) => collectBlockIds(document).map((b) => b.id)),
  );
  const withIds = assignMissingIds(content, {
    used,
    generate: () => nodeIdFromRandomBytes(randomBytes()),
  });
  if (withIds.diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, reason: 'no-ids', message: 'No unused ID could be made for a heading.' };
  }

  const taken = new Set(await names(storage, directory));
  const slug = placement.verbatimName === true ? name : slugOf(name);
  const path = `${directory}/${freeName(slug, taken)}${DOCUMENT_SUFFIX}`;
  const plan = placement.list === false ? undefined : await planDocumentAppend(storage, path);
  const text = serializeDocument(withIds.document);
  await storage.writeText(path, text);
  if (plan !== undefined) await applyDocumentListPlan(storage, plan);
  return {
    ok: true,
    document: path,
    assigned: withIds.assigned.length,
    diagnostics: inFile(
      path,
      checkDocumentText(text, project.stylesheet, project.settings, {
        projectIds: projectIds(project.documents),
      }).diagnostics,
    ),
  };
}
