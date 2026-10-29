import {
  collectBlockIds,
  resolvePageTemplate,
  type Document,
  type NodeId,
  type ProjectSettings,
  type Stylesheet,
} from '@phrase/core';
import { checkDocumentText, parseProject, parseStylesheet } from '@phrase/format';
import { hasErrors, inFile, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX, PROJECT_FILE, findDocuments, readText } from './files.js';
import type { ProjectStorage } from './storage.js';

export interface LoadedDocument {
  /** Relative to the project root, with `/` separators. */
  readonly path: string;
  readonly document: Document;
}

export interface LoadedProject {
  /** Undefined when the project file could not be read or has errors. */
  readonly settings: ProjectSettings | undefined;
  /** Undefined when settings are, or the stylesheet could not be read or has errors. */
  readonly stylesheet: Stylesheet | undefined;
  /** Empty until the project file and the stylesheet are in order. */
  readonly documents: readonly LoadedDocument[];
  readonly diagnostics: readonly ProjectDiagnostic[];
}

/** IDs are unique across the project (ADR 0001); repeats within one document are checked there. */
function duplicateIds(documents: readonly LoadedDocument[]): readonly ProjectDiagnostic[] {
  const first = new Map<NodeId, { file: string; path: string }>();
  const diagnostics: ProjectDiagnostic[] = [];
  for (const { path: file, document } of documents) {
    for (const { id, path } of collectBlockIds(document)) {
      const earlier = first.get(id);
      if (earlier === undefined) first.set(id, { file, path });
      else if (earlier.file !== file) {
        diagnostics.push({
          file,
          severity: 'error',
          code: 'duplicate-id',
          message: `The ID ${id} is also used in ${earlier.file} at ${earlier.path}.`,
          path,
          nodeId: id,
        });
      }
    }
  }
  return diagnostics;
}

/**
 * Reads a project and checks everything in it. The stages build on each other, so a later stage
 * runs only when the earlier one has no errors: the project file, the stylesheet, the documents.
 */
export async function loadProject(storage: ProjectStorage): Promise<LoadedProject> {
  const diagnostics: ProjectDiagnostic[] = [];
  const stopped = (settings?: ProjectSettings, stylesheet?: Stylesheet): LoadedProject => ({
    settings,
    stylesheet,
    documents: [],
    diagnostics,
  });

  const projectText = await readText(storage, PROJECT_FILE, diagnostics);
  if (projectText === undefined) return stopped();
  const project = parseProject(projectText);
  diagnostics.push(...inFile(PROJECT_FILE, project.diagnostics));
  if (hasErrors(project.diagnostics)) return stopped();
  const { settings } = project;

  const stylesheetText = await readText(storage, settings.stylesheet, diagnostics);
  if (stylesheetText === undefined) return stopped(settings);
  const parsedStylesheet = parseStylesheet(stylesheetText);
  diagnostics.push(...inFile(settings.stylesheet, parsedStylesheet.diagnostics));
  if (hasErrors(parsedStylesheet.diagnostics)) return stopped(settings);
  const { stylesheet } = parsedStylesheet;

  const defaultTemplate = settings.defaults.pageTemplate;
  if (
    defaultTemplate !== undefined &&
    resolvePageTemplate(stylesheet, defaultTemplate) === undefined
  ) {
    diagnostics.push({
      file: PROJECT_FILE,
      severity: 'error',
      code: 'unknown-page-template',
      message: `The page template "${defaultTemplate}" does not exist in the stylesheet.`,
      path: 'defaults.page-template',
    });
    return stopped(settings);
  }

  const paths = await findDocuments(storage);
  if (paths.length === 0) {
    diagnostics.push({
      file: PROJECT_FILE,
      severity: 'warning',
      code: 'no-documents',
      message: `The project has no ${DOCUMENT_SUFFIX} documents.`,
    });
  }

  const documents: LoadedDocument[] = [];
  for (const path of paths) {
    const text = await readText(storage, path, diagnostics);
    if (text === undefined) continue;
    const checked = checkDocumentText(text, stylesheet, settings);
    diagnostics.push(...inFile(path, checked.diagnostics));
    documents.push({ path, document: checked.document });
  }
  diagnostics.push(...duplicateIds(documents));
  return { settings, stylesheet, documents, diagnostics };
}
