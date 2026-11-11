import { DOCUMENT_SUFFIX, type LoadedProject } from '@phrase/project';
import { headingsOf, nestHeadings, type HeadingNode } from './headings.js';

export interface OutlineDocument {
  /** Relative to the project root, with `/` separators. */
  readonly path: string;
  /** The title of the document, else the name of its file. */
  readonly title: string;
  readonly headings: readonly HeadingNode[];
}

const nameOf = (path: string): string => {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.endsWith(DOCUMENT_SUFFIX) ? file.slice(0, -DOCUMENT_SUFFIX.length) : file;
};

/** The documents of a project by path, each with its headings nested and numbered. */
export function outlineOf(
  project: Pick<LoadedProject, 'documents' | 'stylesheet'>,
): readonly OutlineDocument[] {
  return [...project.documents]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path, document }) => ({
      path,
      title: document.meta.title ?? nameOf(path),
      headings: nestHeadings(headingsOf(document, project.stylesheet)),
    }));
}
