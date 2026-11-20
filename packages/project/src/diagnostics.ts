import type { Diagnostic } from '@stanza/core';

/** A diagnostic and the file it is about, relative to the project root. */
export interface ProjectDiagnostic extends Diagnostic {
  readonly file: string;
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

export function inFile(
  file: string,
  diagnostics: readonly Diagnostic[],
): readonly ProjectDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic, file }));
}

/** Drops diagnostics that repeat an earlier one: the same problem found by two checks. */
export function withoutRepeats(
  diagnostics: readonly ProjectDiagnostic[],
): readonly ProjectDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = [d.file, d.severity, d.code, d.path ?? '', d.line ?? '', d.message].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
