import {
  collectBlockIds,
  checkReferencePaths,
  indexProjectReferences,
  outlinePaths,
  projectIds,
  resolvePageTemplate,
  type Document,
  type NodeId,
  type OutlineEntry,
  type ProjectSettings,
  type Stylesheet,
} from '@stanza/core';
import {
  LEGACY_FORMAT_CODE,
  LEGACY_FORMAT_MESSAGE,
  checkParsedDocument,
  parseDocument,
  parseProject,
  parseStylesheet,
  type ParseResult,
} from '@stanza/format';
import { hasErrors, inFile, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX, PROJECT_FILE, findDocuments, readText } from './files.js';
import { LEGACY_PROJECT_FILE } from './migrate.js';
import type { ProjectStorage } from './storage.js';

export interface LoadedDocument {
  /** Relative to the project root, with `/` separators. */
  readonly path: string;
  readonly document: Document;
  /** False for a document that the list of documents leaves out (ADR 0072): checked, not built. */
  readonly listed: boolean;
}

export interface LoadedProject {
  /** Undefined when the project file could not be read or has errors. */
  readonly settings: ProjectSettings | undefined;
  /** Undefined when settings are, or the stylesheet could not be read or has errors. */
  readonly stylesheet: Stylesheet | undefined;
  /** Empty until the project file and the stylesheet are in order. Listed ones come first, in order. */
  readonly documents: readonly LoadedDocument[];
  /** The outline as the project file gives it, or all documents by path when it gives none. */
  readonly outline: readonly OutlineEntry[];
  readonly diagnostics: readonly ProjectDiagnostic[];
}

export interface ProjectConfiguration {
  readonly settings: ProjectSettings | undefined;
  readonly stylesheet: Stylesheet | undefined;
  readonly stylesheetText: string | undefined;
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
 * Reads and checks project configuration before document discovery, for a safe local preview.
 */
export async function loadProjectConfiguration(
  storage: ProjectStorage,
): Promise<ProjectConfiguration> {
  const diagnostics: ProjectDiagnostic[] = [];
  const stopped = (settings?: ProjectSettings): ProjectConfiguration => ({
    settings,
    stylesheet: undefined,
    stylesheetText: undefined,
    diagnostics,
  });

  const projectText = await readText(storage, PROJECT_FILE, diagnostics);
  if (projectText === undefined) {
    await explainLegacyProject(storage, diagnostics);
    return stopped();
  }
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

  return { settings, stylesheet, stylesheetText, diagnostics };
}

/** Reads and checks every document against the configuration of this same project snapshot. */
export async function loadProject(
  storage: ProjectStorage,
  configuration?: ProjectConfiguration,
): Promise<LoadedProject> {
  const config = configuration ?? (await loadProjectConfiguration(storage));
  const { settings, stylesheet } = config;
  const diagnostics = [...config.diagnostics];
  if (settings === undefined || stylesheet === undefined) {
    return { settings, stylesheet, documents: [], outline: settings?.documents ?? [], diagnostics };
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
  // The list gives the order. What it leaves out is still checked, after the rest (ADR 0072).
  const listedPaths = settings.documents === undefined ? paths : outlinePaths(settings.documents);
  const listed = new Set(listedPaths);
  const found = new Set(paths);
  for (const path of listedPaths) {
    if (!path.endsWith(DOCUMENT_SUFFIX)) {
      diagnostics.push({
        file: PROJECT_FILE,
        severity: 'error',
        code: 'invalid-path',
        message: `The document "${path}" must end in ${DOCUMENT_SUFFIX}.`,
        path: 'documents',
      });
    } else if (!found.has(path)) {
      diagnostics.push({
        file: PROJECT_FILE,
        severity: 'error',
        code: 'missing-document',
        message: `The document "${path}" in the list of documents does not exist.`,
        path: 'documents',
        fix: { kind: 'document-list', action: 'remove', document: path },
      });
    }
  }
  const order = [
    ...listedPaths.filter((path) => found.has(path)),
    ...paths.filter((path) => !listed.has(path)),
  ];
  const texts: { readonly path: string; readonly parsed: ParseResult }[] = [];
  for (const path of order) {
    const text = await readText(storage, path, diagnostics);
    if (text !== undefined) texts.push({ path, parsed: parseDocument(text) });
  }
  // A reference may point at a block of any document, so every document is read before checking.
  const ids = projectIds(texts.map(({ parsed }) => ({ document: parsed.document })));
  const allPaths = new Set(texts.map(({ path }) => path));
  for (const { path, parsed } of texts) {
    // A review document (ADR 0084) is checked like any other, and never listed or built.
    const reviews = parsed.document.meta.reviews;
    if (reviews !== undefined && !allPaths.has(reviews)) {
      diagnostics.push({
        file: path,
        severity: 'warning',
        code: 'unknown-reviewed-document',
        message: `This review document reviews "${reviews}", which is not a document of the project.`,
      });
    }
    if (!listed.has(path) && reviews === undefined) {
      diagnostics.push({
        file: path,
        severity: 'warning',
        code: 'unlisted-document',
        message: `The document is not in the list of documents of ${PROJECT_FILE}, so it is checked but not built.`,
        fix: { kind: 'document-list', action: 'append', document: path },
      });
    }
    const checked = checkParsedDocument(parsed, stylesheet, settings, { projectIds: ids });
    diagnostics.push(...inFile(path, checked.diagnostics));
    documents.push({
      path,
      document: checked.document,
      listed: listed.has(path) && reviews === undefined,
    });
  }
  diagnostics.push(...duplicateIds(documents));
  const references = indexProjectReferences(
    documents.map(({ path, document }) => ({ file: path, document })),
  );
  const documentPaths = new Set(documents.map(({ path }) => path));
  for (const { path, document } of documents) {
    diagnostics.push(
      ...inFile(path, checkReferencePaths(document, path, documentPaths, references)),
    );
  }
  const outline =
    settings.documents ?? paths.map((path): OutlineEntry => ({ kind: 'document', path }));
  return { settings, stylesheet, documents, outline, diagnostics };
}

/**
 * A folder with `phrase.yaml` and no `stanza.yaml` is a project from before the rename (ADR
 * 0083): the unreadable project file becomes the `legacy-format` error, which names the fix.
 */
async function explainLegacyProject(
  storage: ProjectStorage,
  diagnostics: ProjectDiagnostic[],
): Promise<void> {
  try {
    await storage.readText(LEGACY_PROJECT_FILE);
  } catch {
    return;
  }
  const index = diagnostics.findIndex(
    (d) => d.file === PROJECT_FILE && d.code === 'file-unreadable',
  );
  if (index === -1) return;
  diagnostics[index] = {
    file: LEGACY_PROJECT_FILE,
    severity: 'error',
    code: LEGACY_FORMAT_CODE,
    message: LEGACY_FORMAT_MESSAGE,
  };
}
