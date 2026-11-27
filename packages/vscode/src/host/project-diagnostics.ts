import * as vscode from 'vscode';
import type { Fix } from '@stanza/core';
import {
  loadProject,
  loadProjectConfiguration,
  type LoadedProject,
  type ProjectConfiguration,
} from '@stanza/project';
import { groupByFile, type DiagnosticEntry } from './diagnostics.js';
import { storageOf, uriInProject } from './project-files.js';

export const toDiagnostic = (entry: DiagnosticEntry): vscode.Diagnostic => {
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
  diagnostic.source = 'stanza';
  return diagnostic;
};

/** How a diagnostic is found again when VS Code asks for the fixes of a range. */
const fixKey = (uri: vscode.Uri, code: unknown, message: string): string =>
  `${uri.toString()}\u0000${String(code)}\u0000${message}`;

interface ProjectState {
  readonly root: vscode.Uri;
  readonly subscriptions: vscode.Disposable[];
  revision: number;
  configuration?: { revision: number; promise: Promise<ProjectConfiguration> };
  loading?: { revision: number; promise: Promise<LoadedProject> };
  snapshot?: LoadedProject;
}

/** The Problems panel for the projects that are open: everything `loadProject` checks (ADR 0025). */
export class ProjectDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('stanza');
  /** The files that each project has diagnostics for, to clear those that are in order again. */
  private readonly owned = new Map<string, vscode.Uri[]>();
  private readonly fixes = new Map<string, ReadonlyMap<string, Fix>>();
  private readonly projects = new Map<string, ProjectState>();
  private readonly buffers = [
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      this.bufferChanged(document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.isDirty) this.bufferChanged(document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      this.bufferChanged(document);
    }),
  ];

  private bufferChanged(document: vscode.TextDocument): void {
    if (!/\.(?:stanza\.md|ya?ml)$/.test(document.fileName)) return;
    const path = vscode.Uri.file(document.fileName).path;
    for (const state of this.projects.values()) {
      if (path.startsWith(`${state.root.path}/`)) this.invalidate(state.root);
    }
  }

  private state(root: vscode.Uri): ProjectState {
    const known = this.projects.get(root.toString());
    if (known !== undefined) return known;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '**/*.{yaml,yml,stanza.md,png,jpg,jpeg}'),
    );
    const invalidate = (): void => {
      this.invalidate(root);
    };
    const state: ProjectState = {
      root,
      revision: 0,
      subscriptions: [
        watcher,
        watcher.onDidChange(invalidate),
        watcher.onDidCreate(invalidate),
        watcher.onDidDelete(invalidate),
      ],
    };
    this.projects.set(root.toString(), state);
    return state;
  }

  invalidate(root: vscode.Uri): void {
    const state = this.state(root);
    state.revision += 1;
    delete state.snapshot;
  }

  /** Only a snapshot checked against the current buffers and files can be reused. */
  current(root: vscode.Uri): LoadedProject | undefined {
    return this.state(root).snapshot;
  }

  async configuration(root: vscode.Uri): Promise<ProjectConfiguration> {
    const state = this.state(root);
    const revision = state.revision;
    if (state.configuration?.revision !== revision) {
      state.configuration = { revision, promise: loadProjectConfiguration(storageOf(root)) };
    }
    const configuration = await state.configuration.promise;
    return revision === state.revision ? configuration : this.configuration(root);
  }

  /** Shares clean snapshots and concurrent requests; invalidated loads are never published. */
  async load(root: vscode.Uri): Promise<LoadedProject> {
    const state = this.state(root);
    if (state.snapshot !== undefined) return state.snapshot;
    const revision = state.revision;
    if (state.loading?.revision !== revision) {
      const promise = this.configuration(root).then((configuration) =>
        loadProject(storageOf(root), configuration),
      );
      state.loading = { revision, promise };
    }
    const loading = state.loading;
    let loaded: LoadedProject;
    try {
      loaded = await loading.promise;
    } finally {
      if (state.loading === loading) delete state.loading;
    }
    if (this.projects.get(root.toString()) !== state)
      throw new Error('The project snapshot service was disposed.');
    if (revision !== state.revision) return this.load(root);
    const current = this.current(root);
    if (current !== undefined) return current;
    state.snapshot = loaded;
    this.publish(root, loaded);
    return loaded;
  }

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
  refresh(root: vscode.Uri): Promise<LoadedProject> {
    this.invalidate(root);
    return this.load(root);
  }

  private publish(root: vscode.Uri, loaded: LoadedProject): void {
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
  }

  dispose(): void {
    for (const subscription of this.buffers) subscription.dispose();
    for (const state of this.projects.values()) {
      for (const subscription of state.subscriptions) subscription.dispose();
    }
    this.projects.clear();
    this.collection.dispose();
  }
}
