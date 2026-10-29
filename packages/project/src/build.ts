import { applyDefaults, isSafeRelativePath } from '@phrase/core';
import { exportDocx } from '@phrase/export-docx';
import { hasErrors, inFile, withoutRepeats, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX } from './files.js';
import { loadProject } from './load.js';
import type { ProjectStorage } from './storage.js';

export interface BuildOptions {
  /** The directory for the output, relative to the project root. */
  readonly outDir: string;
  /** Written into every package, so the same project gives the same bytes. */
  readonly timestamp: Date;
}

export interface BuildResult {
  /** The files written, relative to the project root. Empty when there were errors. */
  readonly written: readonly string[];
  readonly diagnostics: readonly ProjectDiagnostic[];
  readonly documents: number;
}

/** `documents/a.phrase.md` becomes `<outDir>/documents/a.docx`. */
export function outputPath(outDir: string, documentPath: string): string {
  return `${outDir}/${documentPath.slice(0, -DOCUMENT_SUFFIX.length)}.docx`;
}

/**
 * Checks a project and writes one DOCX per document. Nothing is written when anything has an
 * error, so an output directory never holds half a build.
 */
export async function buildProject(
  storage: ProjectStorage,
  options: BuildOptions,
): Promise<BuildResult> {
  if (!isSafeRelativePath(options.outDir)) {
    return {
      written: [],
      documents: 0,
      diagnostics: [
        {
          file: options.outDir,
          severity: 'error',
          code: 'invalid-output-directory',
          message: 'The output directory must be a relative path with "/" separators and no "..".',
        },
      ],
    };
  }

  const loaded = await loadProject(storage);
  const documents = loaded.documents.length;
  const { settings, stylesheet } = loaded;
  if (hasErrors(loaded.diagnostics) || settings === undefined || stylesheet === undefined) {
    return { written: [], documents, diagnostics: loaded.diagnostics };
  }

  const diagnostics: ProjectDiagnostic[] = [...loaded.diagnostics];
  const outputs: { path: string; bytes: Uint8Array }[] = [];
  for (const { path, document } of loaded.documents) {
    // The effective metadata has the project's defaults filled in.
    const effective = { ...document, meta: applyDefaults(settings, document.meta) };
    const result = await exportDocx(effective, stylesheet, { timestamp: options.timestamp });
    diagnostics.push(...inFile(path, result.diagnostics));
    if (result.bytes !== undefined) {
      outputs.push({ path: outputPath(options.outDir, path), bytes: result.bytes });
    }
  }

  // The exporter checks the document again, so its findings repeat those of loading.
  const unique = withoutRepeats(diagnostics);
  if (hasErrors(unique)) return { written: [], documents, diagnostics: unique };
  for (const { path, bytes } of outputs) await storage.writeFile(path, bytes);
  return { written: outputs.map((output) => output.path), documents, diagnostics: unique };
}
