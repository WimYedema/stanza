import type { OutlineEntry } from '@stanza/core';
import { DOCUMENT_SUFFIX, type LoadedProject } from '@stanza/project';
import { headingsOf, nestHeadings, type HeadingNode } from './headings.js';

export interface OutlineDocument {
  readonly kind: 'document';
  /** Relative to the project root, with `/` separators. */
  readonly path: string;
  /** The title of the document, else the name of its file. */
  readonly title: string;
  readonly headings: readonly HeadingNode[];
  /** False for a document that the list of documents of the project leaves out (ADR 0072). */
  readonly listed: boolean;
}

export interface OutlineGroup {
  readonly kind: 'group';
  readonly title: string;
  readonly items: readonly OutlineItem[];
}

export type OutlineItem = OutlineDocument | OutlineGroup;

const nameOf = (path: string): string => {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.endsWith(DOCUMENT_SUFFIX) ? file.slice(0, -DOCUMENT_SUFFIX.length) : file;
};

/**
 * The documents of a project as its outline gives them, groups included, each document with its
 * headings nested and numbered. A listed document that does not exist is left out, since the load
 * reports it; documents that the list leaves out come last.
 */
export function outlineOf(
  project: Pick<LoadedProject, 'documents' | 'outline' | 'stylesheet'>,
): readonly OutlineItem[] {
  const byPath = new Map(project.documents.map((loaded) => [loaded.path, loaded]));
  const shown = new Set<string>();
  const documentOf = (path: string): OutlineDocument | undefined => {
    const loaded = byPath.get(path);
    if (loaded === undefined) return undefined;
    shown.add(path);
    return {
      kind: 'document',
      path,
      title: loaded.document.meta.title ?? nameOf(path),
      headings: nestHeadings(headingsOf(loaded.document, project.stylesheet)),
      listed: loaded.listed,
    };
  };
  const itemsOf = (entries: readonly OutlineEntry[]): OutlineItem[] =>
    entries.flatMap((entry): OutlineItem[] => {
      if (entry.kind === 'group') {
        return [{ kind: 'group', title: entry.title, items: itemsOf(entry.items) }];
      }
      const found = documentOf(entry.path);
      return found === undefined ? [] : [found];
    });
  const listed = itemsOf(project.outline);
  const rest = project.documents
    .filter((loaded) => !shown.has(loaded.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .flatMap((loaded) => documentOf(loaded.path) ?? []);
  return [...listed, ...rest];
}
