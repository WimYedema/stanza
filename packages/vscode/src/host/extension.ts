// First, so that it takes the time before the rest of the bundle runs (ADR 0101).
import { loadedAt } from './load-start.js';
import { performance } from 'node:perf_hooks';
import * as vscode from 'vscode';
import { StylesheetSaves } from './declare-variant.js';
import { registerEditStyles } from './edit-styles-command.js';
import { ExportOnSave } from './export-on-save.js';
import { registerAdoptMarkdown } from './adopt-markdown-command.js';
import { registerAddAgentInstructions } from './add-agent-instructions-command.js';
import { registerGoToHeading } from './go-to-heading-command.js';
import { registerGoToLine } from './go-to-line-command.js';
import { registerImportWord } from './import-word-command.js';
import { registerPullReview } from './review-pull-command.js';
import { registerMakeReference } from './make-reference-command.js';
import { measureOnFirstOpen, registerMeasureResponsiveness } from './measure-command.js';
import { registerNewDocument } from './new-document-command.js';
import { registerDocumentListCommands } from './document-list-commands.js';
import { registerNewProject } from './new-project-command.js';
import { registerOpenInWord } from './open-in-word-command.js';
import { registerPushReview } from './push-review-command.js';
import { registerStanzaTree } from './stanza-tree.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { StanzaEditorProvider } from './provider.js';
import { registerDeclareVariant } from './quick-fix.js';
import { StylesEditorProvider } from './styles-provider.js';
import { activationLine, clockNow, timingFile } from './startup-times.js';

export function activate(context: vscode.ExtensionContext): void {
  const start = clockNow();
  const record = timingFile(process.env['STANZA_TIMING_FILE']);
  const diagnostics = new ProjectDiagnostics();
  const log = vscode.window.createOutputChannel('Stanza');
  const saves = new StylesheetSaves(log);
  const exporter = new ExportOnSave(diagnostics, log);
  const editors = new StanzaEditorProvider(context, diagnostics, log, saves, record);
  context.subscriptions.push(
    diagnostics,
    log,
    saves,
    exporter,
    registerOpenInWord(exporter),
    registerPushReview(context.workspaceState),
    ...registerDeclareVariant(diagnostics, saves),
    vscode.window.registerCustomEditorProvider(
      StanzaEditorProvider.viewType,
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
    registerGoToLine((uri, block) => {
      editors.reveal(uri, block);
    }),
    registerMakeReference((uri) => {
      editors.makeReference(uri);
    }),
    registerStanzaTree(editors, diagnostics),
    registerMeasureResponsiveness(editors, diagnostics, log),
    registerEditStyles(),
    registerNewProject(),
    registerNewDocument(),
    ...registerDocumentListCommands(diagnostics),
    registerImportWord(log),
    registerPullReview(log, context.workspaceState),
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
  const activation = {
    hostStart: performance.timeOrigin,
    loaded: loadedAt,
    start,
    end: clockNow(),
  };
  record?.('host-start', activation.hostStart);
  record?.('loaded', activation.loaded);
  record?.('activate-start', activation.start);
  record?.('activate-end', activation.end);
  log.appendLine(activationLine(activation));
  measureOnFirstOpen(editors, process.env['STANZA_MEASURE_RESULTS']);
}

export function deactivate(): void {
  // Everything that needs disposing is in the subscriptions of the context.
}
