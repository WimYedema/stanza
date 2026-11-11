import * as vscode from 'vscode';
import { StylesheetSaves } from './declare-variant.js';
import { registerEditStyles } from './edit-styles-command.js';
import { ExportOnSave } from './export-on-save.js';
import { registerAdoptMarkdown } from './adopt-markdown-command.js';
import { registerAddAgentInstructions } from './add-agent-instructions-command.js';
import { registerGoToHeading } from './go-to-heading-command.js';
import { registerImportWord } from './import-word-command.js';
import { registerNewDocument } from './new-document-command.js';
import { registerNewProject } from './new-project-command.js';
import { registerOpenInWord } from './open-in-word-command.js';
import { registerPhraseTree } from './phrase-tree.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { PhraseEditorProvider } from './provider.js';
import { registerDeclareVariant } from './quick-fix.js';
import { StylesEditorProvider } from './styles-provider.js';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new ProjectDiagnostics();
  const log = vscode.window.createOutputChannel('Phrase');
  const saves = new StylesheetSaves(log);
  const exporter = new ExportOnSave(diagnostics, log);
  const editors = new PhraseEditorProvider(context, diagnostics, log, saves);
  context.subscriptions.push(
    diagnostics,
    log,
    saves,
    exporter,
    registerOpenInWord(exporter),
    ...registerDeclareVariant(diagnostics, saves),
    vscode.window.registerCustomEditorProvider(
      PhraseEditorProvider.viewType,
      editors,
      // The editor keeps its state when its tab is hidden, and one editor serves a document. The
      // find widget of VS Code searches the page, so the text of the document can be found.
      {
        webviewOptions: { retainContextWhenHidden: true, enableFindWidget: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
    registerGoToHeading((uri, block) => {
      editors.reveal(uri, block);
    }),
    registerPhraseTree(editors),
    registerEditStyles(),
    registerNewProject(),
    registerNewDocument(),
    registerImportWord(log),
    registerAdoptMarkdown(log),
    registerAddAgentInstructions(),
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
