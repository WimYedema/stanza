import { moveValuesToTokens, parseProject } from '@phrase/format';
import { hasErrors, inFile, type ProjectDiagnostic } from './diagnostics.js';
import { PROJECT_FILE, readText } from './files.js';
import type { ProjectStorage } from './storage.js';

export interface FixStylesheetOptions {
  /** Report what would change and write nothing. */
  readonly check: boolean;
}

export interface FixStylesheetResult {
  /** The stylesheet, relative to the project root; undefined when the project file is not in order. */
  readonly path: string | undefined;
  /** `changed` is written, or with `check` only reported; `refused` is left as it was. */
  readonly status: 'unchanged' | 'changed' | 'refused';
  /** The values in styles that name a token now, and the tokens added for them. */
  readonly moved: number;
  readonly added: number;
  readonly diagnostics: readonly ProjectDiagnostic[];
}

/**
 * Moves the hex colors and font lists in the styles of the project's stylesheet into tokens
 * (ADR 0074), the repair for `raw-color` and `raw-font` (ADR 0065). The stylesheet is written only
 * when something moved, and left as it was when a value cannot be moved.
 */
export async function useTokensInStylesheet(
  storage: ProjectStorage,
  options: FixStylesheetOptions,
): Promise<FixStylesheetResult> {
  const diagnostics: ProjectDiagnostic[] = [];
  const none = (path?: string): FixStylesheetResult => ({
    path,
    status: 'refused',
    moved: 0,
    added: 0,
    diagnostics,
  });

  const projectText = await readText(storage, PROJECT_FILE, diagnostics);
  if (projectText === undefined) return none();
  const project = parseProject(projectText);
  if (hasErrors(project.diagnostics)) {
    diagnostics.push(...inFile(PROJECT_FILE, project.diagnostics));
    return none();
  }
  const path = project.settings.stylesheet;
  const text = await readText(storage, path, diagnostics);
  if (text === undefined) return none(path);

  const result = moveValuesToTokens(text);
  if (!result.ok) {
    diagnostics.push({ file: path, severity: 'error', code: result.code, message: result.message });
    return none(path);
  }
  if (result.moved === 0) return { path, status: 'unchanged', moved: 0, added: 0, diagnostics };
  if (!options.check) await storage.writeText(path, result.text);
  return { path, status: 'changed', moved: result.moved, added: result.added, diagnostics };
}
