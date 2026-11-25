import { applyDefaults, isSafeRelativePath, type ReviewProtection } from '@stanza/core';
import { exportDocx } from '@stanza/export-docx';
import { hasErrors, inFile, withoutRepeats, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX } from './files.js';
import { loadProject } from './load.js';
import { referenceTargets } from './reference-links.js';
import { sourceStamps, type SourceRevisions } from './revisions.js';
import type { ProjectStorage } from './storage.js';

export interface BuildOptions {
  /** The directory for the output, relative to the project root. */
  readonly outDir: string;
  /** Written into every package, so the same project gives the same bytes. */
  readonly timestamp: Date;
  /**
   * Where the documents stand in version control, for the revision stamp of each package
   * (ADR 0084). Without it the packages are stamped with their path and source only.
   */
  readonly revisions?: SourceRevisions;
  /**
   * The protection of the packages for this build, in place of the project's `review-protection`
   * (ADR 0085), such as `none` for a copy that goes to SharePoint.
   */
  readonly protection?: ReviewProtection;
}

export interface BuildResult {
  /** The files written, relative to the project root. Empty when there were errors. */
  readonly written: readonly string[];
  readonly diagnostics: readonly ProjectDiagnostic[];
  readonly documents: number;
}

/** `documents/a.stanza.md` becomes `<outDir>/documents/a.docx`. */
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
  const stamps = await sourceStamps(
    storage,
    built.map((entry) => entry.path),
    options.revisions,
  );
  for (const { path, document } of built) {
    const source = stamps.get(path);
    // The effective metadata has the project's defaults filled in.
    const effective = { ...document, meta: applyDefaults(settings, document.meta) };
    const result = await exportDocx(effective, stylesheet, {
      timestamp: options.timestamp,
      images: loaded.images,
      otherTargets: targetsFor(path),
      ...(source !== undefined ? { source } : {}),
      protection: options.protection ?? settings.reviewProtection ?? 'comments',
      ...(settings.linkSchemes !== undefined ? { linkSchemes: settings.linkSchemes } : {}),
    });
    diagnostics.push(...inFile(path, result.diagnostics));
    if (result.bytes !== undefined) {
      outputs.push({ path: outputPath(options.outDir, path), bytes: result.bytes });
    }
  }

  // The exporter checks the document again, so its findings repeat those of loading.
  const unique = [...withoutRepeats(diagnostics)];
  if (hasErrors(unique)) return { written: [], documents, diagnostics: unique };
  // A file that cannot be written, such as one that is open in Word during a review, is reported,
  // and the other files are still written.
  const written: string[] = [];
  for (const { path, bytes } of outputs) {
    try {
      await storage.writeFile(path, bytes);
      written.push(path);
    } catch (error) {
      unique.push(notWritten(path, error));
    }
  }
  return { written, documents, diagnostics: unique };
}

/** The error code of a file system error, such as `EBUSY`, when it has one. */
const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

/** Why an output file could not be written, in words that say what to do. */
export function notWritten(path: string, error: unknown): ProjectDiagnostic {
  const code = errorCode(error);
  const locked = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
  const reason = error instanceof Error ? error.message : String(error);
  return {
    file: path,
    severity: 'error',
    code: 'output-not-written',
    message: locked
      ? 'The file is open in another program, such as Word, so it was not written. Close it and build again.'
      : `The file could not be written: ${reason}`,
  };
}
