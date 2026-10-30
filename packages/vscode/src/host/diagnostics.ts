import type { ProjectDiagnostic } from '@phrase/project';

/** A diagnostic of the project as the Problems panel needs it, with plain data only. */
export interface DiagnosticEntry {
  /** Relative to the project root. */
  readonly file: string;
  /** Zero-based line, or undefined for the start of the file. */
  readonly line: number | undefined;
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
}

/** The diagnostics of the project, grouped by file, in the order they were found. */
export function groupByFile(
  diagnostics: readonly ProjectDiagnostic[],
): ReadonlyMap<string, readonly DiagnosticEntry[]> {
  const grouped = new Map<string, DiagnosticEntry[]>();
  for (const diagnostic of diagnostics) {
    const where = diagnostic.path === undefined ? '' : ` [${diagnostic.path}]`;
    const entry: DiagnosticEntry = {
      file: diagnostic.file,
      line: diagnostic.line === undefined ? undefined : Math.max(0, diagnostic.line - 1),
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: `${diagnostic.message}${where}`,
    };
    grouped.set(diagnostic.file, [...(grouped.get(diagnostic.file) ?? []), entry]);
  }
  return grouped;
}
