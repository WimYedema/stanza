import { applyDefaults, indexProjectReferences, indexReferences } from '@stanza/core';
import { exportDocx } from '@stanza/export-docx';
import { hasErrors, inFile, withoutRepeats, type ProjectDiagnostic } from './diagnostics.js';
import { PROJECT_FILE } from './files.js';
import type { LoadedProject } from './load.js';
import { referenceTargets } from './reference-links.js';
import { sourceStamps } from './revisions.js';
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

/** The DOCX of a document, made in memory, or why there is none. */
export interface DocumentBytes {
  /** Undefined when the export was blocked or found errors. */
  readonly bytes: Uint8Array | undefined;
  readonly diagnostics: readonly ProjectDiagnostic[];
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
  const problem = outDirProblem(options.outDir);
  const made = await documentBytes(storage, loaded, documentPath, options);
  if (made.blocked) return { written: undefined, diagnostics: made.diagnostics, blocked: true };
  if (problem !== undefined) return { written: undefined, diagnostics: [problem], blocked: false };
  if (made.bytes === undefined) {
    return { written: undefined, diagnostics: made.diagnostics, blocked: false };
  }
  const written = outputPath(options.outDir, documentPath);
  await storage.writeFile(written, made.bytes);
  return { written, diagnostics: made.diagnostics, blocked: false };
}

/**
 * The DOCX of one document as a build makes it, in memory, for a host that writes it elsewhere,
 * such as a push for review (ADR 0088).
 */
export async function documentBytes(
  storage: ProjectStorage,
  loaded: LoadedProject,
  documentPath: string,
  options: Omit<BuildOptions, 'outDir'>,
): Promise<DocumentBytes> {
  const { settings, stylesheet } = loaded;
  const found = loaded.documents.find((entry) => entry.path === documentPath);
  const relevant = [PROJECT_FILE, settings?.stylesheet, documentPath];
  const blocked =
    settings === undefined ||
    stylesheet === undefined ||
    found === undefined ||
    hasErrors(loaded.diagnostics.filter((d) => relevant.includes(d.file)));
  if (blocked) return { bytes: undefined, diagnostics: [], blocked: true };
  const index = indexProjectReferences(
    loaded.documents.map(({ path, document }) => ({ file: path, document })),
  );
  const own = indexReferences(found.document);
  const ambiguous = [...index.duplicates].filter(
    (id) => own.targets.has(id) || own.references.some((reference) => reference.target === id),
  );
  if (ambiguous.length > 0) {
    return {
      bytes: undefined,
      blocked: true,
      diagnostics: ambiguous.map((id) => ({
        file: documentPath,
        severity: 'error',
        code: 'duplicate-id',
        nodeId: id,
        message: `The ID ${id} is duplicated in the project; this document cannot be exported with an ambiguous target.`,
      })),
    };
  }
  const effective = { ...found.document, meta: applyDefaults(settings, found.document.meta) };
  const source = (await sourceStamps(storage, [documentPath], options.revisions)).get(documentPath);
  const result = await exportDocx(effective, stylesheet, {
    timestamp: options.timestamp,
    ...(source !== undefined ? { source } : {}),
    protection: options.protection ?? settings.reviewProtection ?? 'comments',
    otherTargets: referenceTargets(loaded.documents)(documentPath),
    ...(settings.linkSchemes !== undefined ? { linkSchemes: settings.linkSchemes } : {}),
  });
  // The exporter checks the document again, so its findings repeat those of loading.
  const known = new Set(loaded.diagnostics.map((d) => JSON.stringify([d.file, d.code, d.message])));
  const diagnostics = withoutRepeats(inFile(documentPath, result.diagnostics)).filter(
    (d) => !known.has(JSON.stringify([d.file, d.code, d.message])),
  );
  if (result.bytes === undefined || hasErrors(diagnostics)) {
    return { bytes: undefined, diagnostics, blocked: false };
  }
  return { bytes: result.bytes, diagnostics, blocked: false };
}
