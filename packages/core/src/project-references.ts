import type { Document } from './document.js';
import { collectBlockIds } from './document-ids.js';
import { isNodeId, type NodeId } from './ids.js';
import { indexReferences, type Reference, type ReferenceTarget } from './references.js';
import type { Diagnostic } from './diagnostic.js';
import {
  mapDocumentLinks,
  parseReferenceLink,
  referenceFile,
  relativeReferenceFile,
} from './reference-links.js';

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
  readonly duplicates: ReadonlySet<NodeId>;
}

/** Reads the targets and the references of all documents of a project, which share their IDs. */
export function indexProjectReferences(
  documents: readonly { readonly file: string; readonly document: Document }[],
): ProjectReferenceIndex {
  const targets = new Map<NodeId, ProjectTarget>();
  const references: ProjectReference[] = [];
  const duplicates = new Set<NodeId>();
  for (const { file, document } of documents) {
    const seen = new Set<NodeId>();
    for (const { id } of collectBlockIds(document)) {
      if (seen.has(id) || targets.has(id)) duplicates.add(id);
      seen.add(id);
    }
    const index = indexReferences(document);
    for (const [id, target] of index.targets) {
      if (!targets.has(id)) targets.set(id, { ...target, file });
    }
    for (const reference of index.references) references.push({ ...reference, file });
  }
  return { targets, references, duplicates };
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
  return isNodeId(target) && !index.duplicates.has(target) ? index.targets.get(target) : undefined;
}

export function checkReferencePaths(
  document: Document,
  file: string,
  documents: ReadonlySet<string>,
  index: ProjectReferenceIndex,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reported = new Set<string>();
  mapDocumentLinks(document, (href, path) => {
    const link = parseReferenceLink(href);
    if (link === undefined || link.file === '') return href;
    const key = `${path}\0${href}`;
    if (reported.has(key)) return href;
    reported.add(key);
    const destination = referenceFile(file, link.file);
    if (destination === undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-reference-path',
        message: `The link "${href}" must stay inside the project and use a valid relative path.`,
        path,
      });
    } else if (link.target === undefined) {
      if (!documents.has(destination))
        diagnostics.push({
          severity: 'error',
          code: 'missing-linked-document',
          message: `The linked document "${destination}" does not exist in this project.`,
          path,
        });
    } else {
      const target = resolveProjectReference(index, link.target);
      if (target !== undefined && target.file !== destination) {
        const replacement = `${relativeReferenceFile(file, target.file)}#${link.target}`;
        diagnostics.push({
          severity: 'warning',
          code: 'stale-reference-path',
          message: `The ID ${link.target} is in "${target.file}", not "${destination}". Update the link to "${replacement}".`,
          path,
          fix: { kind: 'reference-path', href, replacement },
        });
      }
    }
    return href;
  });
  return diagnostics;
}

export function fixReferencePaths(
  document: Document,
  file: string,
  index: ProjectReferenceIndex,
): Document {
  return mapDocumentLinks(document, (href) => {
    const link = parseReferenceLink(href);
    if (
      link?.target === undefined ||
      link.file === '' ||
      referenceFile(file, link.file) === undefined
    )
      return href;
    const target = resolveProjectReference(index, link.target);
    return target === undefined || referenceFile(file, link.file) === target.file
      ? href
      : `${relativeReferenceFile(file, target.file)}#${link.target}`;
  });
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
