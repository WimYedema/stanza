import type { Document } from './document.js';
import { collectBlockIds } from './document-ids.js';
import { isNodeId, type NodeId } from './ids.js';
import { indexReferences, type Reference, type ReferenceTarget } from './references.js';

/** A block with an ID in one document of a project (ADR 0073). */
export interface ProjectTarget extends ReferenceTarget {
  /** The path of the document that holds the block. */
  readonly file: string;
}

/** A reference in one document of a project. */
export interface ProjectReference extends Reference {
  readonly file: string;
}

export interface ProjectReferenceIndex {
  /** The first block with each ID in the order of the documents; a repeat is a `duplicate-id`. */
  readonly targets: ReadonlyMap<NodeId, ProjectTarget>;
  /** In the order of the documents, then of each document. */
  readonly references: readonly ProjectReference[];
}

/** Reads the targets and the references of all documents of a project, which share their IDs. */
export function indexProjectReferences(
  documents: readonly { readonly file: string; readonly document: Document }[],
): ProjectReferenceIndex {
  const targets = new Map<NodeId, ProjectTarget>();
  const references: ProjectReference[] = [];
  for (const { file, document } of documents) {
    const index = indexReferences(document);
    for (const [id, target] of index.targets) {
      if (!targets.has(id)) targets.set(id, { ...target, file });
    }
    for (const reference of index.references) references.push({ ...reference, file });
  }
  return { targets, references };
}

/** The IDs of all blocks of the documents, which a reference may point at. */
export const projectIds = (
  documents: readonly { readonly document: Document }[],
): ReadonlySet<string> =>
  new Set(documents.flatMap(({ document }) => collectBlockIds(document).map((entry) => entry.id)));

/** The block that a reference points at, in whichever document it is, or undefined. */
export function resolveProjectReference(
  index: ProjectReferenceIndex,
  target: string,
): ProjectTarget | undefined {
  return isNodeId(target) ? index.targets.get(target) : undefined;
}

/** The references of all documents that point at a block, in the order of the documents. */
export const findProjectIncoming = (
  index: ProjectReferenceIndex,
  id: NodeId,
): readonly ProjectReference[] => index.references.filter((reference) => reference.target === id);

/** The references that point at no block of the project. */
export const findProjectBroken = (index: ProjectReferenceIndex): readonly ProjectReference[] =>
  index.references.filter(
    (reference) => resolveProjectReference(index, reference.target) === undefined,
  );
