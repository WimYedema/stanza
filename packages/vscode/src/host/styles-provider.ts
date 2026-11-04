import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { setProperty, unsetProperty, type StylesheetEdit } from '@phrase/format';
import {
  parseStylesWebviewMessage,
  type StylesHostMessage,
  type StylesWebviewMessage,
} from '../shared/styles-protocol.js';
import { lineEdit } from './line-diff.js';
import { normalized } from './review.js';
import { buildStylesHtml } from './styles-html.js';
import { locateStylesheet } from './styles-project.js';

/**
 * Opens the stylesheet of a project in the style editor, bound to the text of the file (ADR 0036).
 * It is opened on purpose, with "Open With" or a command, and never by default.
 */
export class StylesEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'phrase.styles';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel,
  ) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const session = new StylesSession(this.context, this.log, document, panel);
    panel.onDidDispose(() => {
      session.dispose();
    });
    session.start();
  }
}

class StylesSession {
  private readonly disposables: vscode.Disposable[] = [];
  /** Everything that happens goes through one queue, in order. */
  private queue: Promise<void> = Promise.resolve();
  /** The file has been shown to be the stylesheet of its project, so it may be edited. */
  private accepted = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
  ) {}

  start(): void {
    const { webview } = this.panel;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    webview.html = buildStylesHtml({
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'styles.js')).toString(),
      nonce: randomBytes(16).toString('base64'),
      cspSource: webview.cspSource,
    });
    this.disposables.push(
      webview.onDidReceiveMessage((raw: unknown) => {
        this.enqueue(() => this.onMessage(parseStylesWebviewMessage(raw)));
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== this.document.uri.toString()) return;
        this.enqueue(() => this.post({ type: 'text', text: this.text() }));
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(work).catch((error: unknown) => {
      this.log.appendLine(error instanceof Error ? (error.stack ?? error.message) : String(error));
    });
  }

  private async post(message: StylesHostMessage): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  /** The text of the stylesheet with `\n`, whatever line ending the file has. */
  private text(): string {
    return normalized(this.document.getText());
  }

  private async onMessage(message: StylesWebviewMessage | undefined): Promise<void> {
    switch (message?.type) {
      case 'ready':
        await this.sendInit();
        return;
      case 'open-as-text':
        await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        return;
      case 'set':
        if (this.accepted) await this.edit(setProperty(this.text(), message.path, message.value));
        return;
      case 'unset':
        if (this.accepted) await this.edit(unsetProperty(this.text(), message.path));
        return;
      case undefined:
        return;
    }
  }

  /**
   * Applies a change that was worked out on the text as it is now: only the lines that differ, so
   * that the cursor, the history and Git stay sensible. A change that was refused is told to the page.
   */
  private async edit(result: StylesheetEdit): Promise<void> {
    if (!result.ok) {
      await this.post({ type: 'edit-refused', message: result.message });
      return;
    }
    const change = lineEdit(this.text(), result.text);
    if (change === undefined) return;
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(
      this.document.uri,
      new vscode.Range(
        change.start.line,
        change.start.character,
        change.end.line,
        change.end.character,
      ),
      change.text,
    );
    if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
      await this.post({
        type: 'edit-refused',
        message: 'The edit of the stylesheet was not applied.',
      });
    }
  }

  /** The editor takes only the stylesheet that the project file names. */
  private async sendInit(): Promise<void> {
    const found = await locateStylesheet(this.document.uri);
    if (!found.ok) {
      await this.post({ type: 'refused', title: found.title, reasons: found.reasons });
      return;
    }
    if (found.uri.toString() !== this.document.uri.toString()) {
      await this.post({
        type: 'refused',
        title: 'This file is not the stylesheet of its project',
        reasons: [{ message: `The stylesheet of the project is ${found.path}.` }],
      });
      return;
    }
    await this.post({ type: 'init', text: this.text() });
    this.accepted = true;
  }
}
