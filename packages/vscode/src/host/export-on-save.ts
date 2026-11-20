import { posix } from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_BUILD_DATE,
  DOCUMENT_SUFFIX,
  exportDocument,
  type ExportDocumentResult,
} from '@stanza/project';
import { groupByFile } from './diagnostics.js';
import { toDiagnostic, type ProjectDiagnostics } from './project-diagnostics.js';
import { findRoot, storageOf, uriInProject } from './project-files.js';

/** Where the DOCX files go, as for the command line (ADR 0014). */
const OUT_DIR = 'build';

/** How long a message stays in the status bar. */
const STATUS_MS = 5000;

/**
 * Writes the DOCX of a document when it is saved (ADR 0032). The export is the one of the command
 * line, over what is open, so it matches what the editor shows. A document with errors is not
 * exported and the file of an earlier export is left as it was.
 */
export class ExportOnSave implements vscode.Disposable {
  private readonly problems = vscode.languages.createDiagnosticCollection('stanza-export');
  /** The files that each document has export problems for, to clear after a good export. */
  private readonly owned = new Map<string, vscode.Uri[]>();
  private readonly subscription: vscode.Disposable;
  /** Exports run one at a time, in the order of the saves. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly diagnostics: ProjectDiagnostics,
    private readonly log: vscode.OutputChannel,
  ) {
    this.subscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (!saved.fileName.endsWith(DOCUMENT_SUFFIX)) return;
      const enabled = vscode.workspace
        .getConfiguration('stanza', saved.uri)
        .get<boolean>('exportOnSave', true);
      if (!enabled) return;
      void this.exportNow(saved.uri);
    });
  }

  /**
   * Exports a document of a project in its turn, and returns the DOCX written, or undefined when
   * nothing was written. The reasons are shown as for a save.
   */
  exportNow(document: vscode.Uri): Promise<vscode.Uri | undefined> {
    const done = this.queue.then(() => this.export(document));
    this.queue = done.then(
      () => undefined,
      () => undefined,
    );
    return done.catch((error: unknown) => {
      this.log.appendLine(error instanceof Error ? (error.stack ?? error.message) : String(error));
      return undefined;
    });
  }

  private async export(document: vscode.Uri): Promise<vscode.Uri | undefined> {
    const root = await findRoot(document);
    if (root === undefined) return undefined;
    const path = posix.relative(root.path, document.path);
    // The Problems panel shows what is wrong with the project itself, as it does while editing.
    const loaded = await this.diagnostics.refresh(root);
    let result: ExportDocumentResult;
    try {
      result = await exportDocument(storageOf(root), loaded, path, {
        outDir: OUT_DIR,
        timestamp: DEFAULT_BUILD_DATE,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log.appendLine(`The DOCX of ${path} was not written: ${reason}`);
      void vscode.window.showErrorMessage(
        `The DOCX of ${path} could not be written: ${reason} If it is open in Word, close it and save again.`,
      );
      return undefined;
    }
    this.show(document, root, result);
    const message =
      result.written !== undefined
        ? `Stanza: exported ${result.written}`
        : result.blocked
          ? 'Stanza: not exported, the project or this document has errors (see Problems)'
          : 'Stanza: not exported, the export found errors (see Problems)';
    vscode.window.setStatusBarMessage(message, STATUS_MS);
    return result.written === undefined ? undefined : uriInProject(root, result.written);
  }

  /** Shows what the export found, in place of what an earlier export of the document found. */
  private show(document: vscode.Uri, root: vscode.Uri, result: ExportDocumentResult): void {
    const key = document.toString();
    for (const uri of this.owned.get(key) ?? []) this.problems.delete(uri);
    const uris: vscode.Uri[] = [];
    for (const [file, entries] of groupByFile(result.diagnostics)) {
      const uri = uriInProject(root, file);
      this.problems.set(uri, entries.map(toDiagnostic));
      uris.push(uri);
    }
    this.owned.set(key, uris);
  }

  dispose(): void {
    this.subscription.dispose();
    this.problems.dispose();
  }
}
