import { applyDefaults, isSafeRelativePath } from '@phrase/core';
import { exportDocx } from '@phrase/export-docx';
import { hasErrors, inFile, withoutRepeats, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX } from './files.js';
import { loadProject } from './load.js';
import { referenceTargets } from './reference-links.js';
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

/** The earliest date the zip format can hold, used when no date is given, so output repeats. */
export const DEFAULT_BUILD_DATE = new Date('1980-01-01T00:00:00Z');

/** The problem with an output directory, or undefined when it is a safe relative path. */
export function outDirProblem(outDir: string): ProjectDiagnostic | undefined {
  return isSafeRelativePath(outDir)
    ? undefined
    : {
        file: outDir,
        severity: 'error',
        code: 'invalid-output-directory',
        message: 'The output directory must be a relative path with "/" separators and no "..".',
      };
}

/**
 * Checks a project and writes one DOCX per document. Nothing is written when anything has an
 * error, so an output directory never holds half a build.
 */
export async function buildProject(
  storage: ProjectStorage,
  options: BuildOptions,
): Promise<BuildResult> {
  const problem = outDirProblem(options.outDir);
  if (problem !== undefined) return { written: [], documents: 0, diagnostics: [problem] };

  const loaded = await loadProject(storage);
  // A document that the list leaves out is checked, and not built (ADR 0072).
  const built = loaded.documents.filter((entry) => entry.listed);
  const documents = built.length;
  const { settings, stylesheet } = loaded;
  if (hasErrors(loaded.diagnostics) || settings === undefined || stylesheet === undefined) {
    return { written: [], documents, diagnostics: loaded.diagnostics };
  }

  const diagnostics: ProjectDiagnostic[] = [...loaded.diagnostics];
  const outputs: { path: string; bytes: Uint8Array }[] = [];
  const targetsFor = referenceTargets(loaded.documents);
  for (const { path, document } of built) {
    // The effective metadata has the project's defaults filled in.
    const effective = { ...document, meta: applyDefaults(settings, document.meta) };
    const result = await exportDocx(effective, stylesheet, {
      timestamp: options.timestamp,
      otherTargets: targetsFor(path),
    });
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
