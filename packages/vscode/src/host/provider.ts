import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import * as vscode from 'vscode';
import {
  collectBlockIds,
  indexProjectReferences,
  isNodeId,
  parseReferenceLink,
  referenceFile,
  resolveProjectReference,
  resolveLink,
  type Block,
  type Document,
  type ListItemBlock,
  type NodeId,
  type ProjectSettings,
} from '@stanza/core';
import { parseDocument, serializeDocument } from '@stanza/format';
import { styleUsage, type LoadedProject } from '@stanza/project';
import {
  parseWebviewMessage,
  type HostMessage,
  type InlineDiagnostic,
  type MetadataField,
  type WebviewMessage,
} from '../shared/protocol.js';
import { buildHtml } from './html.js';
import { declareVariantInProject, parseFix, type StylesheetSaves } from './declare-variant.js';
import { EDIT_STYLES_COMMAND } from './edit-styles-command.js';
import { lineEdit } from './line-diff.js';
import { findRoot, storageOf, uriInProject } from './project-files.js';
import type { ProjectDiagnostics } from './project-diagnostics.js';
import { normalized, reviewText } from './review.js';
import { summarizeUsage } from './usage-summary.js';

/** After a change, the project is checked again when nothing has changed for this long. */
const REFRESH_DELAY_MS = 300;

/** Opens `*.stanza.md` in the visual editor, bound to the text of the file (ADR 0025). */
export class StanzaEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'stanza.editor';

  /** The open editors by document, to tell one of them to scroll. */
  private readonly sessions = new Map<string, EditorSession>();
  /** Blocks to scroll to in documents whose editor is about to open. */
  private readonly waiting = new Map<string, number>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: ProjectDiagnostics,
    private readonly log: vscode.OutputChannel,
    private readonly saves: StylesheetSaves,
  ) {}

  /** Scrolls the editor of a document to a top-level block, if that document has one open. */
  reveal(uri: vscode.Uri, block: number): void {
    this.sessions.get(uri.toString())?.reveal(block);
  }

  /** Opens the list of headings for a reference in the editor of a document, if it has one open. */
  makeReference(uri: vscode.Uri): void {
    this.sessions.get(uri.toString())?.makeReference();
  }

  /**
   * Shows a document in the Stanza editor, in front, and scrolls to a block when one is given. The
   * editor may not be open yet, so the block is kept until it is.
   */
  async open(uri: vscode.Uri, block?: number): Promise<void> {
    const key = uri.toString();
    if (block !== undefined) {
      const session = this.sessions.get(key);
      if (session === undefined) this.waiting.set(key, block);
      else session.reveal(block);
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, StanzaEditorProvider.viewType);
  }

  async followReference(source: vscode.Uri, target: string): Promise<void> {
    const link = parseReferenceLink(target);
    const external = /^[a-z][a-z0-9+.-]*:/i.test(target);
    if (
      (!external && link === undefined) ||
      (link?.target !== undefined && !isNodeId(link.target))
    ) {
      await vscode.window.showErrorMessage(
        'Stanza: use an immutable block ID, not a heading title fragment, for a reference.',
      );
      return;
    }
    const root = await findRoot(source);
    if (root === undefined) {
      await vscode.window.showErrorMessage(
        'Stanza: could not find the project for this reference.',
      );
      return;
    }
    const loaded = await this.diagnostics.load(root);
    if (loaded.settings === undefined || loaded.stylesheet === undefined) {
      await vscode.window.showErrorMessage(
        'Stanza: the project has errors and its references cannot be followed.',
      );
      return;
    }
    if (link === undefined) {
      const resolved = resolveLink(target, loaded.settings.linkSchemes);
      if (!resolved.ok) {
        await vscode.window.showErrorMessage(`Stanza: ${resolved.message}`);
      } else if (/^(https?|mailto):/i.test(resolved.href)) {
        if (!(await vscode.env.openExternal(vscode.Uri.parse(resolved.href)))) {
          await vscode.window.showErrorMessage(`Stanza: could not open "${resolved.href}".`);
        }
      } else {
        await vscode.window.showErrorMessage(
          'Stanza: the link does not resolve to a web or mail address.',
        );
      }
      return;
    }
    const index = indexProjectReferences(
      loaded.documents.map(({ path, document }) => ({ file: path, document })),
    );
    const own = posix.relative(root.path, source.path);
    const hinted = link.file === '' ? own : referenceFile(own, link.file);
    if (hinted === undefined) {
      await vscode.window.showErrorMessage(
        'Stanza: the document link must stay inside this project.',
      );
      return;
    }
    if (link.target !== undefined && isNodeId(link.target) && index.duplicates.has(link.target)) {
      await vscode.window.showErrorMessage(
        `Stanza: reference #${link.target} is ambiguous because its ID is duplicated.`,
      );
      return;
    }
    const resolved =
      link.target === undefined ? undefined : resolveProjectReference(index, link.target);
    const destination = loaded.documents.find(
      ({ path }) => path === (link.target === undefined ? hinted : resolved?.file),
    );
    const block =
      destination === undefined || link.target === undefined || !isNodeId(link.target)
        ? undefined
        : topLevelBlock(destination.document, link.target);
    if (destination === undefined || (link.target !== undefined && block === undefined)) {
      await vscode.window.showErrorMessage(
        link.target === undefined
          ? `Stanza: document "${hinted}" was not found in this project.`
          : `Stanza: reference target #${link.target} was not found in this project.`,
      );
      return;
    }
    await this.open(uriInProject(root, destination.path), block);
  }

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const session = new EditorSession(
      this.context,
      this.diagnostics,
      this.log,
      this.saves,
      document,
      panel,
      (target) => this.followReference(document.uri, target),
    );
    const key = document.uri.toString();
    this.sessions.set(key, session);
    const block = this.waiting.get(key);
    if (block !== undefined) {
      this.waiting.delete(key);
      session.reveal(block);
    }
    panel.onDidDispose(() => {
      this.sessions.delete(key);
      session.dispose();
    });
    session.start();
  }
}

type Shown = 'nothing' | 'editor' | 'refused';

/** The files that the project is made of, which can change without being saved. */
const isProjectFile = (fileName: string): boolean =>
  fileName.endsWith('.stanza.md') || fileName.endsWith('.yaml') || fileName.endsWith('.yml');

const metadataFields = (settings: ProjectSettings): readonly MetadataField[] | undefined =>
  settings.fields === undefined
    ? undefined
    : [...settings.fields].map(([name, field]) => ({ name, ...field }));

function containsId(block: Block | ListItemBlock, id: NodeId): boolean {
  if (block.id === id) return true;
  if (block.type === 'list') {
    return block.items.some((item) => item.blocks.some((child) => containsId(child, id)));
  }
  if (block.type === 'table') {
    return [...block.header, ...block.rows.flat()].some((cell) =>
      cell.blocks.some((child) => containsId(child, id)),
    );
  }
  return false;
}

function topLevelBlock(document: Document, id: NodeId): number | undefined {
  const index = document.blocks.findIndex((block) => containsId(block, id));
  return index < 0 ? undefined : index;
}

/** One editor on one document. Everything that happens to it goes through one queue, in order. */
class EditorSession {
  private readonly disposables: vscode.Disposable[] = [];
  private queue: Promise<void> = Promise.resolve();
  /** The text of the document after the last change that came from the webview. */
  private fromWebview: string | undefined;
  private shown: Shown = 'nothing';
  /** A block to scroll to once the editor is shown. */
  private revealing: number | undefined;
  /** The last change of the document was an undo or a redo. */
  private undoing = false;
  private root: vscode.Uri | undefined;
  private watched: string | undefined;
  private stylesheetText: string | undefined;
  private usedKey: string | undefined;
  private defaultsKey: string | undefined;
  private fieldsKey: string | undefined;
  private schemesKey: string | undefined;
  private usageKey: string | undefined;
  private diagnosticsKey: string | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: ProjectDiagnostics,
    private readonly log: vscode.OutputChannel,
    private readonly saves: StylesheetSaves,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly followReference: (target: string) => Promise<void>,
  ) {}

  start(): void {
    const { webview } = this.panel;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    webview.html = buildHtml({
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      nonce: randomBytes(16).toString('base64'),
      cspSource: webview.cspSource,
    });
    this.disposables.push(
      webview.onDidReceiveMessage((raw: unknown) => {
        this.enqueue(() => this.onMessage(parseWebviewMessage(raw)));
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === this.document.uri.toString()) {
          this.undoing =
            event.reason === vscode.TextDocumentChangeReason.Undo ||
            event.reason === vscode.TextDocumentChangeReason.Redo;
          this.enqueue(() => this.onDocumentChanged());
        }
        if (isProjectFile(event.document.fileName)) this.scheduleRefresh();
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.refreshTimer);
    for (const disposable of this.disposables) disposable.dispose();
  }

  private isDisposed(): boolean {
    return this.disposed;
  }

  /** Asks the webview to scroll to a block, or does so as soon as the editor is shown. */
  reveal(block: number): void {
    this.enqueue(async () => {
      if (this.shown === 'editor') await this.post({ type: 'reveal', block });
      else if (this.shown === 'nothing') this.revealing = block;
    });
  }

  /** Asks the webview to open the list of headings for a reference, when the editor is shown. */
  makeReference(): void {
    this.enqueue(async () => {
      if (this.shown === 'editor') await this.post({ type: 'make-reference' });
    });
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(work).catch((error: unknown) => {
      this.log.appendLine(error instanceof Error ? (error.stack ?? error.message) : String(error));
    });
  }

  private async post(message: HostMessage): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  /** The text of the document with `\n`, whatever line ending the file has. */
  private text(): string {
    return normalized(this.document.getText());
  }

  private async onMessage(message: WebviewMessage | undefined): Promise<void> {
    switch (message?.type) {
      case 'ready':
        await this.sendInit();
        return;
      case 'startup-timing':
        this.log.appendLine(
          `Stanza startup: visible ${String(message.visibleMs)} ms, editable ${String(message.editableMs)} ms (${this.document.fileName}).`,
        );
        return;
      case 'change':
        await this.apply(message.text);
        return;
      case 'metadata-change':
        await this.applyMetadata(message.before, message.text);
        return;
      case 'open-project':
        if (this.root === undefined) {
          await vscode.window.showErrorMessage('Stanza: the metadata project was not found.');
        } else {
          await vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.joinPath(this.root, 'stanza.yaml'),
          );
        }
        return;
      case 'format': {
        const review = reviewText(this.text());
        if (!review.ok && review.formatted !== undefined) await this.apply(review.formatted, false);
        return;
      }
      case 'open-as-text':
        await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        return;
      case 'edit-styles':
        await vscode.commands.executeCommand(EDIT_STYLES_COMMAND, message.style);
        return;
      case 'follow-reference':
        try {
          await this.followReference(message.target);
        } finally {
          await this.post({ type: 'navigation-finished' });
        }
        return;
      case 'declare-variant':
        await this.declareVariant(message.style, message.mark);
        return;
      case undefined:
        return;
    }
  }

  /** Applies only the lines that differ, so the cursor, the history and Git stay sensible. */
  private async apply(text: string, fromEditor = true): Promise<boolean> {
    const edit = lineEdit(this.text(), text);
    if (edit === undefined) return true;
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(
      this.document.uri,
      new vscode.Range(edit.start.line, edit.start.character, edit.end.line, edit.end.character),
      edit.text,
    );
    // The change that comes back from VS Code for this edit is the editor's own, and is not sent on.
    this.fromWebview = fromEditor ? text : undefined;
    if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
      this.fromWebview = undefined;
      this.log.appendLine('The edit of the document was not applied.');
      await this.onDocumentChanged();
      return false;
    }
    return true;
  }

  private async applyMetadata(before: string, text: string): Promise<void> {
    let message = '';
    let ok = false;
    try {
      if (this.shown !== 'editor' || this.text() !== before) {
        message = 'The document changed. Reload properties before applying this draft.';
        this.fromWebview = undefined;
        await this.onDocumentChanged();
      } else if (!reviewText(text).ok || !reviewText(before).ok) {
        message =
          'Properties require valid canonical Stanza source. Open the document as text to inspect it.';
      } else {
        const previous = parseDocument(before).document;
        const next = parseDocument(text).document;
        if (serializeDocument({ ...next, meta: previous.meta }) !== before) {
          message = 'The properties edit also changes document content and was refused.';
        } else {
          ok = await this.apply(text);
          if (!ok)
            message = 'The properties edit was not applied. Inspect the document and try again.';
          else if (this.text() !== text) {
            ok = false;
            message =
              'The document changed while applying properties. Reload properties before retrying.';
            this.fromWebview = undefined;
            await this.onDocumentChanged();
          }
        }
      }
    } catch (error) {
      message = `The properties edit failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log.appendLine(message);
      await this.onDocumentChanged();
    }
    await this.post({ type: 'metadata-result', ok, message, text: ok ? text : this.text() });
  }

  private async onDocumentChanged(): Promise<void> {
    const text = this.text();
    if (text === this.fromWebview) return;
    this.fromWebview = undefined;
    const review = reviewText(text);
    if (!review.ok) {
      this.shown = 'refused';
      await this.post({
        type: 'refused',
        title: 'This file cannot be edited visually',
        reasons: review.reasons,
        canFormat: review.formatted !== undefined,
      });
      return;
    }
    if (this.shown === 'editor') {
      // What the person undoes or redoes is not news to them (ADR 0062).
      await this.post({
        type: 'external-text',
        text: review.text,
        ...(this.undoing ? { mark: false } : {}),
      });
    } else await this.sendInit();
  }

  private async refuse(title: string, reasons: readonly { message: string }[]): Promise<void> {
    this.shown = 'refused';
    await this.post({ type: 'refused', title, reasons, canFormat: false });
  }

  /**
   * Allows a mark in a style by editing the stylesheet, which is saved with this document. The new
   * stylesheet is sent before the answer, so that the webview can try its command again.
   */
  private async declareVariant(style: string, mark: string): Promise<void> {
    const fix = parseFix(style, mark);
    const outcome =
      fix === undefined || this.root === undefined
        ? ({ ok: false, message: 'The variant could not be declared.' } as const)
        : await declareVariantInProject(this.root, fix.style, fix.mark);
    if (!outcome.ok) {
      await this.post({ type: 'declared', ok: false, message: outcome.message });
      return;
    }
    this.saves.saveWith(this.document.uri, outcome.document);
    await this.refresh();
    await this.post({ type: 'declared', ok: true, message: '' });
  }

  private usedIds(loaded: LoadedProject, root: vscode.Uri): readonly string[] {
    const own = posix.relative(root.path, this.document.uri.path);
    return loaded.documents
      .filter((entry) => entry.path !== own)
      .flatMap((entry) => collectBlockIds(entry.document).map((block) => block.id))
      .sort();
  }

  private async sendInit(): Promise<void> {
    const root = (this.root ??= await findRoot(this.document.uri));
    if (root === undefined) {
      await this.refuse('This file is not in a Stanza project', [
        {
          message:
            'No stanza.yaml was found in the folder of this file or in a folder above it, inside the workspace folder.',
        },
      ]);
      return;
    }
    this.watch(root);
    const configuration = await this.diagnostics.configuration(root);
    if (this.isDisposed()) return;
    if (
      configuration.settings === undefined ||
      configuration.stylesheet === undefined ||
      configuration.stylesheetText === undefined
    ) {
      await this.diagnostics.load(root);
      const reasons = configuration.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .slice(0, 10)
        .map((diagnostic) => ({ message: `${diagnostic.file}: ${diagnostic.message}` }));
      await this.refuse('The project has errors', reasons);
      return;
    }
    const review = reviewText(this.text());
    if (!review.ok) {
      this.shown = 'refused';
      await this.post({
        type: 'refused',
        title: 'This file cannot be edited visually',
        reasons: review.reasons,
        canFormat: review.formatted !== undefined,
      });
      await this.diagnostics.load(root);
      return;
    }
    const { stylesheetText, settings } = configuration;
    const snapshot = this.diagnostics.current(root);
    const cached =
      snapshot?.diagnostics.some((diagnostic) => diagnostic.code === 'file-unreadable') === true
        ? undefined
        : snapshot;
    const usedIds = cached === undefined ? [] : this.usedIds(cached, root);
    this.stylesheetText = stylesheetText;
    this.usedKey = usedIds.join(',');
    this.defaultsKey = JSON.stringify(settings.defaults);
    const fields = metadataFields(settings);
    this.fieldsKey = JSON.stringify(fields);
    this.schemesKey = JSON.stringify(settings.linkSchemes ?? {});
    this.shown = 'editor';
    await this.post({
      type: 'init',
      documentText: review.text,
      stylesheetText,
      defaults: settings.defaults,
      usedIds,
      projectReady: cached !== undefined,
      ...(fields !== undefined ? { fields } : {}),
      ...(settings.linkSchemes !== undefined ? { linkSchemes: settings.linkSchemes } : {}),
    });
    let loaded: LoadedProject;
    try {
      loaded = cached ?? (await this.diagnostics.load(root));
    } catch (error) {
      if (this.isDisposed()) return;
      const reason = error instanceof Error ? error.message : String(error);
      this.log.appendLine(`The project could not be loaded: ${reason}`);
      await this.refuse('The project could not be loaded', [{ message: reason }]);
      return;
    }
    if (this.isDisposed()) return;
    if (
      this.text() !== review.text ||
      (await this.diagnostics.configuration(root)) !== configuration
    ) {
      await this.sendInit();
      return;
    }
    const unreadable = loaded.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'file-unreadable',
    );
    if (unreadable.length > 0) {
      await this.refuse(
        'The project ID index is incomplete',
        unreadable.map((diagnostic) => ({
          message: `${diagnostic.file}: ${diagnostic.message}`,
        })),
      );
      return;
    }
    if (cached === undefined) {
      const ids = this.usedIds(loaded, root);
      this.usedKey = ids.join(',');
      await this.post({ type: 'project-ready', usedIds: ids });
    }
    await this.postUsage(loaded, root, true);
    await this.postDiagnostics(loaded, root, true);
    if (this.revealing !== undefined) {
      await this.post({ type: 'reveal', block: this.revealing });
      this.revealing = undefined;
    }
  }

  /** Tells the webview what the checks say about this document, when that is new or asked for. */
  private async postDiagnostics(
    loaded: LoadedProject,
    root: vscode.Uri,
    force: boolean,
  ): Promise<void> {
    const own = posix.relative(root.path, this.document.uri.path);
    const diagnostics = loaded.diagnostics
      .filter((entry) => entry.file === own)
      .map((entry): InlineDiagnostic => ({
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        ...(entry.path !== undefined ? { path: entry.path } : {}),
        ...(entry.nodeId !== undefined ? { nodeId: entry.nodeId } : {}),
      }));
    const key = JSON.stringify(diagnostics);
    if (!force && key === this.diagnosticsKey) return;
    this.diagnosticsKey = key;
    await this.post({ type: 'diagnostics', diagnostics });
  }

  /** Tells the webview where the styles are used, when that is new or when it is asked for. */
  private async postUsage(loaded: LoadedProject, root: vscode.Uri, force: boolean): Promise<void> {
    if (loaded.stylesheet === undefined) return;
    const own = posix.relative(root.path, this.document.uri.path);
    const usage = summarizeUsage(styleUsage(loaded.documents, loaded.stylesheet), own);
    const key = JSON.stringify(usage);
    if (!force && key === this.usageKey) return;
    this.usageKey = key;
    await this.post({ type: 'usage', usage });
  }

  /** Watches the files of the project, which can change without this document changing. */
  private watch(root: vscode.Uri): void {
    if (this.watched === root.toString()) return;
    this.watched = root.toString();
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '**/*.{yaml,yml,stanza.md}'),
    );
    this.disposables.push(
      watcher,
      watcher.onDidChange(() => {
        this.scheduleRefresh();
      }),
      watcher.onDidCreate(() => {
        this.scheduleRefresh();
      }),
      watcher.onDidDelete(() => {
        this.scheduleRefresh();
      }),
    );
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.enqueue(() => this.refresh());
    }, REFRESH_DELAY_MS);
  }

  /** Checks the project again, and tells the webview about a new stylesheet or new IDs. */
  private async refresh(): Promise<void> {
    const root = this.root;
    if (root === undefined) return;
    const loaded = await this.diagnostics.load(root);
    if (
      this.shown !== 'editor' ||
      loaded.settings === undefined ||
      loaded.stylesheet === undefined
    ) {
      return;
    }
    const stylesheetText = await storageOf(root).readText(loaded.settings.stylesheet);
    if (stylesheetText !== this.stylesheetText) {
      this.stylesheetText = stylesheetText;
      await this.post({ type: 'stylesheet', text: stylesheetText });
    }
    const usedIds = this.usedIds(loaded, root);
    if (usedIds.join(',') !== this.usedKey) {
      this.usedKey = usedIds.join(',');
      await this.post({ type: 'used-ids', ids: usedIds });
    }
    const defaultsKey = JSON.stringify(loaded.settings.defaults);
    if (defaultsKey !== this.defaultsKey) {
      this.defaultsKey = defaultsKey;
      await this.post({ type: 'defaults', defaults: loaded.settings.defaults });
    }
    const schemes = loaded.settings.linkSchemes ?? {};
    const schemesKey = JSON.stringify(schemes);
    if (schemesKey !== this.schemesKey) {
      this.schemesKey = schemesKey;
      await this.post({ type: 'link-schemes', schemes });
    }
    const fields = metadataFields(loaded.settings);
    const fieldsKey = JSON.stringify(fields);
    if (fieldsKey !== this.fieldsKey) {
      this.fieldsKey = fieldsKey;
      await this.post({ type: 'metadata-fields', ...(fields !== undefined ? { fields } : {}) });
    }
    await this.postUsage(loaded, root, false);
    await this.postDiagnostics(loaded, root, false);
  }
}
