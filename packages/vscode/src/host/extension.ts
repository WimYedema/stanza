import * as vscode from 'vscode';
import { StylesheetSaves } from './declare-variant.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { PhraseEditorProvider } from './provider.js';
import { registerDeclareVariant } from './quick-fix.js';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new ProjectDiagnostics();
  const log = vscode.window.createOutputChannel('Phrase');
  const saves = new StylesheetSaves(log);
  context.subscriptions.push(
    diagnostics,
    log,
    saves,
    ...registerDeclareVariant(diagnostics, saves),
    vscode.window.registerCustomEditorProvider(
      PhraseEditorProvider.viewType,
      new PhraseEditorProvider(context, diagnostics, log, saves),
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
