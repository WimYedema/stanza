import * as vscode from 'vscode';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { PhraseEditorProvider } from './provider.js';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new ProjectDiagnostics();
  const log = vscode.window.createOutputChannel('Phrase');
  context.subscriptions.push(
    diagnostics,
    log,
    vscode.window.registerCustomEditorProvider(
      PhraseEditorProvider.viewType,
      new PhraseEditorProvider(context, diagnostics, log),
      // The editor keeps its state when its tab is hidden, and one editor serves a document.
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );
}

export function deactivate(): void {
  // Everything that needs disposing is in the subscriptions of the context.
}
