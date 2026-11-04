import { applyDefaults } from '@phrase/core';
import { exportDocx } from '@phrase/export-docx';
import { hasErrors, inFile, withoutRepeats, type ProjectDiagnostic } from './diagnostics.js';
import { PROJECT_FILE } from './files.js';
import type { LoadedProject } from './load.js';
import type { ProjectStorage } from './storage.js';
import { outDirProblem, outputPath, type BuildOptions } from './build.js';

export interface ExportDocumentResult {
  /** The file written, relative to the project root. Undefined when nothing was written. */
  readonly written: string | undefined;
  /** What the export found. The problems of loading the project are in the loaded project. */
  readonly diagnostics: readonly ProjectDiagnostic[];
  /**
   * The export was not tried: the project file, the stylesheet or the document has an error, or
   * the document is not one of the project.
   */
  readonly blocked: boolean;
}

/**
 * Writes the DOCX of one document of a project that was loaded. Errors in other documents do not
 * stop it, since this file does not depend on them. Nothing is written when there are errors, so
 * the file of an earlier export stays as it was.
 */
export async function exportDocument(
  storage: ProjectStorage,
  loaded: LoadedProject,
  documentPath: string,
  options: BuildOptions,
): Promise<ExportDocumentResult> {
  const { settings, stylesheet } = loaded;
  const found = loaded.documents.find((entry) => entry.path === documentPath);
  const relevant = [PROJECT_FILE, settings?.stylesheet, documentPath];
  const blocked =
    settings === undefined ||
    stylesheet === undefined ||
    found === undefined ||
    hasErrors(loaded.diagnostics.filter((d) => relevant.includes(d.file)));
  if (blocked) return { written: undefined, diagnostics: [], blocked: true };
  const problem = outDirProblem(options.outDir);
  if (problem !== undefined) return { written: undefined, diagnostics: [problem], blocked: false };

  const effective = { ...found.document, meta: applyDefaults(settings, found.document.meta) };
  const result = await exportDocx(effective, stylesheet, { timestamp: options.timestamp });
  // The exporter checks the document again, so its findings repeat those of loading.
  const known = new Set(loaded.diagnostics.map((d) => JSON.stringify([d.file, d.code, d.message])));
  const diagnostics = withoutRepeats(inFile(documentPath, result.diagnostics)).filter(
    (d) => !known.has(JSON.stringify([d.file, d.code, d.message])),
  );
  if (result.bytes === undefined || hasErrors(diagnostics)) {
    return { written: undefined, diagnostics, blocked: false };
  }
  const written = outputPath(options.outDir, documentPath);
  await storage.writeFile(written, result.bytes);
  return { written, diagnostics, blocked: false };
}
