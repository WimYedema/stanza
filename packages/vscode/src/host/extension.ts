import * as vscode from 'vscode';
import { StylesheetSaves } from './declare-variant.js';
import { registerEditStyles } from './edit-styles-command.js';
import { ExportOnSave } from './export-on-save.js';
import { registerNewDocument } from './new-document-command.js';
import { registerNewProject } from './new-project-command.js';
import { registerOpenInWord } from './open-in-word-command.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { PhraseEditorProvider } from './provider.js';
import { registerDeclareVariant } from './quick-fix.js';
import { StylesEditorProvider } from './styles-provider.js';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new ProjectDiagnostics();
  const log = vscode.window.createOutputChannel('Phrase');
  const saves = new StylesheetSaves(log);
  const exporter = new ExportOnSave(diagnostics, log);
  context.subscriptions.push(
    diagnostics,
    log,
    saves,
    exporter,
    registerOpenInWord(exporter),
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
    registerEditStyles(),
    registerNewProject(),
    registerNewDocument(),
    vscode.window.registerCustomEditorProvider(
      StylesEditorProvider.viewType,
      new StylesEditorProvider(context, log),
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
