import * as vscode from 'vscode';
import type { Fix } from '@phrase/core';
import { loadProject, type LoadedProject } from '@phrase/project';
import { groupByFile, type DiagnosticEntry } from './diagnostics.js';
import { storageOf, uriInProject } from './project-files.js';

const toDiagnostic = (entry: DiagnosticEntry): vscode.Diagnostic => {
  const range =
    entry.line === undefined
      ? new vscode.Range(0, 0, 0, 0)
      : new vscode.Range(entry.line, 0, entry.line, Number.MAX_SAFE_INTEGER);
  const diagnostic = new vscode.Diagnostic(
    range,
    entry.message,
    entry.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.code = entry.code;
  diagnostic.source = 'phrase';
  return diagnostic;
};

/** How a diagnostic is found again when VS Code asks for the fixes of a range. */
const fixKey = (uri: vscode.Uri, code: unknown, message: string): string =>
  `${uri.toString()}\u0000${String(code)}\u0000${message}`;

/** The Problems panel for the projects that are open: everything `loadProject` checks (ADR 0025). */
export class ProjectDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('phrase');
  /** The files that each project has diagnostics for, to clear those that are in order again. */
  private readonly owned = new Map<string, vscode.Uri[]>();
  private readonly fixes = new Map<string, ReadonlyMap<string, Fix>>();

  /** The fix that a diagnostic of the last check offers, if it offers one (ADR 0026). */
  fixOf(uri: vscode.Uri, diagnostic: vscode.Diagnostic): Fix | undefined {
    const key = fixKey(uri, diagnostic.code, diagnostic.message);
    for (const fixes of this.fixes.values()) {
      const found = fixes.get(key);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** Loads the project, shows what is wrong with it, and gives the result back. */
  async refresh(root: vscode.Uri): Promise<LoadedProject> {
    const loaded = await loadProject(storageOf(root));
    const next = new Map<string, vscode.Uri>();
    const fixes = new Map<string, Fix>();
    for (const [file, entries] of groupByFile(loaded.diagnostics)) {
      const uri = uriInProject(root, file);
      this.collection.set(uri, entries.map(toDiagnostic));
      for (const entry of entries) {
        if (entry.fix !== undefined) fixes.set(fixKey(uri, entry.code, entry.message), entry.fix);
      }
      next.set(uri.toString(), uri);
    }
    this.fixes.set(root.toString(), fixes);
    for (const uri of this.owned.get(root.toString()) ?? []) {
      if (!next.has(uri.toString())) this.collection.delete(uri);
    }
    this.owned.set(root.toString(), [...next.values()]);
    return loaded;
  }

  dispose(): void {
    this.collection.dispose();
  }
}
