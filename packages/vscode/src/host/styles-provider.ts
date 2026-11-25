import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { isStyleName, type StyleFamily, type StyleName, type Stylesheet } from '@stanza/core';
import {
  parseStylesheet,
  setBlock,
  setProperty,
  unsetProperty,
  type StylesheetEdit,
} from '@stanza/format';
import { loadProject, projectImages, styleUsage, type StyleUse } from '@stanza/project';
import {
  parseStylesWebviewMessage,
  type StyleKind,
  type StylesHostMessage,
  type StylesWebviewMessage,
} from '../shared/styles-protocol.js';
import { imageDataUrls } from './cover-images.js';
import { lineEdit } from './line-diff.js';
import { findRoot, storageOf } from './project-files.js';
import { normalized } from './review.js';
import { removalBlockers } from './style-removal.js';
import { buildStylesHtml } from './styles-html.js';
import { locateStylesheet } from './styles-project.js';

const FAMILY: Record<StyleKind, StyleFamily> = {
  'paragraph-style': 'paragraph',
  'character-style': 'character',
  'table-style': 'table',
};

/** A style to select in the style editor of a stylesheet (ADR 0054). */
export interface StyleSelection {
  readonly kind: StyleKind;
  readonly name: string;
}

const SELECTION_LIFETIME_MS = 10_000;

/** The open editors by the URI of their stylesheet, and the selections that wait for one. */
const sessions = new Map<string, StylesSession>();
const requested = new Map<string, StyleSelection>();

/**
 * Asks the style editor of a stylesheet to select a style: at once if it is open, else when it has
 * started. A request that nothing took up is dropped, so a later start does not jump to a style.
 */
export function requestStyleSelection(uri: vscode.Uri, selection: StyleSelection): void {
  const key = uri.toString();
  requested.set(key, selection);
  setTimeout(() => {
    if (requested.get(key) === selection) requested.delete(key);
  }, SELECTION_LIFETIME_MS);
  sessions.get(key)?.deliverSelection();
}

const stylesOf = (sheet: Stylesheet, kind: StyleKind) =>
  kind === 'paragraph-style'
    ? sheet.paragraphStyles
    : kind === 'character-style'
      ? sheet.characterStyles
      : sheet.tableStyles;

/**
 * Opens the stylesheet of a project in the style editor, bound to the text of the file (ADR 0036).
 * It is opened on purpose, with "Open With" or a command, and never by default.
 */
export class StylesEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'stanza.styles';

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
  /** The images sent last, to send them only when they change; the page starts with none. */
  private imagesKey = JSON.stringify({});

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
    const images = vscode.workspace.createFileSystemWatcher('**/*.{png,jpg,jpeg}');
    const imagesChanged = (): void => {
      this.enqueue(() => this.sendImages());
    };
    this.disposables.push(
      images,
      images.onDidChange(imagesChanged),
      images.onDidCreate(imagesChanged),
      images.onDidDelete(imagesChanged),
    );
    sessions.set(this.document.uri.toString(), this);
  }

  dispose(): void {
    if (sessions.get(this.document.uri.toString()) === this) {
      sessions.delete(this.document.uri.toString());
    }
    for (const disposable of this.disposables) disposable.dispose();
  }

  /** Tells the page to select the style that was asked for, once the editor has started. */
  deliverSelection(): void {
    this.enqueue(() => this.sendSelection());
  }

  private async sendSelection(): Promise<void> {
    const key = this.document.uri.toString();
    const selection = requested.get(key);
    if (!this.accepted || selection === undefined) return;
    requested.delete(key);
    await this.post({ type: 'select-style', kind: selection.kind, name: selection.name });
  }

  /**
   * Sends the PNG and JPEG files of the project, to choose an image for a cover or a title block and
   * to show it in the preview (ADR 0091), when they differ from those sent last.
   */
  private async sendImages(): Promise<void> {
    if (!this.accepted) return;
    const root = await findRoot(this.document.uri);
    if (root === undefined) return;
    const urls = imageDataUrls(await projectImages(storageOf(root)));
    const key = JSON.stringify(urls);
    if (key === this.imagesKey) return;
    this.imagesKey = key;
    await this.post({ type: 'images', images: urls });
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
      case 'set-block':
        if (this.accepted) {
          await this.edit(setBlock(this.text(), message.path, message.source ?? undefined));
        }
        return;
      case 'add-style':
        if (this.accepted) await this.addStyle(message.kind, message.name, message.basedOn);
        return;
      case 'delete-style':
        if (this.accepted) await this.deleteStyle(message.kind, message.name);
        return;
      case undefined:
        return;
    }
  }

  private async refuse(message: string): Promise<void> {
    await this.post({ type: 'edit-refused', message });
  }

  /** The stylesheet as it is now, or why it cannot be read. */
  private current(): { readonly text: string; readonly sheet: Stylesheet } | string {
    const text = this.text();
    const parsed = parseStylesheet(text);
    return parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'The stylesheet has errors, so no style was changed.'
      : { text, sheet: parsed.stylesheet };
  }

  /** Adds an empty style (ADR 0053). */
  private async addStyle(
    kind: StyleKind,
    name: string,
    basedOn: string | undefined,
  ): Promise<void> {
    const current = this.current();
    if (typeof current === 'string') {
      await this.refuse(current);
      return;
    }
    const family = FAMILY[kind];
    const styles = stylesOf(current.sheet, kind);
    if (!isStyleName(name)) {
      await this.refuse('A style name is in kebab-case, such as note or warning-note.');
    } else if (styles.has(name)) {
      await this.refuse(`There is a ${family} style "${name}" already.`);
    } else if (basedOn !== undefined && !(isStyleName(basedOn) && styles.has(basedOn))) {
      await this.refuse(`There is no ${family} style "${basedOn}" to be based on.`);
    } else {
      const value = basedOn === undefined ? {} : { 'based-on': basedOn };
      await this.edit(setProperty(current.text, [`${kind}s`, name], value));
    }
  }

  /** The uses of a style in the documents of the project, or why they cannot be known. */
  private async usesOf(
    sheet: Stylesheet,
    family: StyleFamily,
    name: StyleName,
  ): Promise<readonly StyleUse[] | string> {
    const root = await findRoot(this.document.uri);
    if (root === undefined) return 'The project of the stylesheet was not found.';
    const loaded = await loadProject(storageOf(root));
    if (loaded.stylesheet === undefined) {
      return 'The project has errors, so the documents that use the style cannot be known.';
    }
    const usage = styleUsage(loaded.documents, sheet);
    const map =
      family === 'paragraph'
        ? usage.paragraphStyles
        : family === 'character'
          ? usage.characterStyles
          : usage.tableStyles;
    return map.get(name) ?? [];
  }

  /** Deletes a style that nothing uses or refers to, after the person says yes (ADR 0053). */
  private async deleteStyle(kind: StyleKind, name: string): Promise<void> {
    const current = this.current();
    if (typeof current === 'string') {
      await this.refuse(current);
      return;
    }
    const family = FAMILY[kind];
    if (!isStyleName(name) || !stylesOf(current.sheet, kind).has(name)) {
      await this.refuse(`There is no ${family} style "${name}".`);
      return;
    }
    const uses = await this.usesOf(current.sheet, family, name);
    if (typeof uses === 'string') {
      await this.refuse(uses);
      return;
    }
    const blockers = removalBlockers(current.sheet, family, name, uses);
    if (blockers.length > 0) {
      await this.refuse(`The ${family} style "${name}" was not deleted. ${blockers.join(' ')}`);
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `Delete the ${family} style "${name}"? Nothing uses it.`,
      { modal: true },
      'Delete',
    );
    if (answer !== 'Delete') return;
    await this.edit(unsetProperty(this.text(), [`${kind}s`, name]));
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
    await this.sendSelection();
    await this.sendImages();
  }
}
