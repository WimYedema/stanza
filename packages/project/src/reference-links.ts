import {
  indexProjectReferences,
  mapDocumentLinks,
  parseReferenceLink,
  referenceFile,
} from '@phrase/core';
import type { ReferenceFile } from '@phrase/export-docx';
import { DOCUMENT_SUFFIX } from './files.js';
import type { LoadedDocument } from './load.js';

/**
 * The path from the DOCX of one document to the DOCX of another, which mirror the paths of the
 * documents under the same output directory (ADR 0014), so that the directory itself drops out.
 * Each segment is encoded, as in the link of a file.
 */
export function docxLink(from: string, to: string): string {
  const fromDirectory = from.split('/').slice(0, -1);
  const target = `${to.slice(0, -DOCUMENT_SUFFIX.length)}.docx`.split('/');
  let common = 0;
  while (
    common < fromDirectory.length &&
    common < target.length - 1 &&
    fromDirectory[common] === target[common]
  ) {
    common += 1;
  }
  const up = fromDirectory.slice(common).map(() => '..');
  return [...up, ...target.slice(common).map(encodeURIComponent)].join('/');
}

/**
 * For each document, the blocks of the other documents that it may point at, with the DOCX file of
 * their document (ADR 0073), keyed by immutable ID. File-only links are keyed by source href.
 * A document that the list leaves out is not built, and says so.
 */
export function referenceTargets(
  documents: readonly LoadedDocument[],
): (current: string) => ReadonlyMap<string, ReferenceFile> {
  const index = indexProjectReferences(
    documents.map(({ path, document }) => ({ file: path, document })),
  );
  const built = new Map(documents.map((entry) => [entry.path, entry.listed]));
  return (current) => {
    const found = new Map<string, ReferenceFile>();
    for (const [id, target] of index.targets) {
      if (index.duplicates.has(id)) continue;
      if (target.file === current) continue;
      found.set(id, {
        href: docxLink(current, target.file),
        built: built.get(target.file) === true,
      });
    }
    const source = documents.find(({ path }) => path === current);
    if (source !== undefined) {
      mapDocumentLinks(source.document, (href) => {
        const link = parseReferenceLink(href);
        if (link !== undefined && link.file !== '' && link.target === undefined) {
          const target = referenceFile(current, link.file);
          if (target !== undefined && built.has(target)) {
            found.set(href, { href: docxLink(current, target), built: built.get(target) === true });
          }
        }
        return href;
      });
    }
    return found;
  };
}
