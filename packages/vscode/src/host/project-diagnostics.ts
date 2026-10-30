import * as vscode from 'vscode';
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

/** The Problems panel for the projects that are open: everything `loadProject` checks (ADR 0025). */
export class ProjectDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('phrase');
  /** The files that each project has diagnostics for, to clear those that are in order again. */
  private readonly owned = new Map<string, vscode.Uri[]>();

  /** Loads the project, shows what is wrong with it, and gives the result back. */
  async refresh(root: vscode.Uri): Promise<LoadedProject> {
    const loaded = await loadProject(storageOf(root));
    const next = new Map<string, vscode.Uri>();
    for (const [file, entries] of groupByFile(loaded.diagnostics)) {
      const uri = uriInProject(root, file);
      this.collection.set(uri, entries.map(toDiagnostic));
      next.set(uri.toString(), uri);
    }
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
