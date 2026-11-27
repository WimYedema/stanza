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
  type ImageAsset,
  type ListItemBlock,
  type NodeId,
  type ProjectSettings,
} from '@stanza/core';
import { parseDocument, serializeDocument } from '@stanza/format';
import {
  latestThreads,
  reviewThreads,
  styleUsage,
  threadStatusEdit,
  type LoadedProject,
} from '@stanza/project';
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
import { imageDataUrls } from './cover-images.js';
import { findRoot, storageOf, uriInProject } from './project-files.js';
import type { ProjectDiagnostics } from './project-diagnostics.js';
import { normalized, reviewText } from './review.js';
import {
  pullDocument,
  pushDocument,
  pushedFile,
  rememberedFolder,
  roundStatus,
} from './review-round.js';
import { summarizeUsage } from './usage-summary.js';
import { OpenTimer, type OpenDurations, type RecordMark } from './startup-times.js';
import type { ActionCounts, ActionTimings, ReviewThreadView } from '../shared/protocol.js';

/** The timings of measured actions, and in how many runs each did something (ADR 0101). */
export interface MeasuredActions {
  readonly timings: ActionTimings;
  readonly applied: ActionCounts;
}

/** After a change, the project is checked again when nothing has changed for this long. */
const REFRESH_DELAY_MS = 300;

/** Opens `*.stanza.md` in the visual editor, bound to the text of the file (ADR 0025). */
export class StanzaEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'stanza.editor';

  /** The open editors by document, to tell one of them to scroll. */
  private readonly sessions = new Map<string, EditorSession>();
  /** Blocks to scroll to in documents whose editor is about to open. */
  private readonly waiting = new Map<string, number>();
  /** Who waits for the next editor of a document to be editable, by its URI (ADR 0101). */
  private readonly openWaiters = new Map<string, (durations: OpenDurations) => void>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: ProjectDiagnostics,
    private readonly log: vscode.OutputChannel,
    private readonly saves: StylesheetSaves,
    /** Set only when a measurement script asked for the timing file (ADR 0101). */
    private readonly record?: RecordMark,
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

  /** Who waits for any editor to be editable (ADR 0101). */
  private readonly anyWaiters: ((uri: vscode.Uri) => void)[] = [];

  /** Resolves with the document of the next editor that has been painted editable. */
  anyOpen(): Promise<vscode.Uri> {
    return new Promise((done) => {
      this.anyWaiters.push(done);
    });
  }

  /** Resolves when the next editor of this document has been painted editable (ADR 0101). */
  nextOpen(uri: vscode.Uri): Promise<OpenDurations> {
    return new Promise((done) => {
      this.openWaiters.set(uri.toString(), done);
    });
  }

  /** Times actions in the open editor of a document, which then sends no changes (ADR 0101). */
  measureActions(uri: vscode.Uri, runs: number): Promise<MeasuredActions> | undefined {
    return this.sessions.get(uri.toString())?.measureActions(runs);
  }

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const key = document.uri.toString();
    const timer = new OpenTimer(
      document.fileName,
      (line) => {
        this.log.appendLine(line);
      },
      this.record,
    );
    timer.onDone = (durations) => {
      const waiter = this.openWaiters.get(key);
      this.openWaiters.delete(key);
      waiter?.(durations);
      for (const done of this.anyWaiters.splice(0)) done(document.uri);
    };
    const session = new EditorSession(
      this.context,
      this.diagnostics,
      this.log,
      this.saves,
      document,
      panel,
      (target) => this.followReference(document.uri, target),
      timer,
      this.record !== undefined,
    );
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
  /** The images of the covers and title blocks sent last, to send them only when they change. */
  private imagesKey: string | undefined;
  private usageKey: string | undefined;
  /** The review threads sent last, to send them only when they change. */
  private threadsKey: string | undefined;
  /** Those threads by key, to open or resolve one that the webview names. */
  private sentThreads = new Map<string, ReviewThreadView>();
  private diagnosticsKey: string | undefined;
  /** The project as last loaded, for the status of the review round between refreshes. */
  private loaded: LoadedProject | undefined;
  /** The status of the review round sent last (ADR 0088). */
  private roundKey: string | undefined;
  /** The watcher of the file in the review folder, by that file. */
  private pushedWatch: { readonly key: string; readonly disposable: vscode.Disposable } | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  /** Who waits for the timings of measured actions (ADR 0101). */
  private actionsWaiter: ((result: MeasuredActions) => void) | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: ProjectDiagnostics,
    private readonly log: vscode.OutputChannel,
    private readonly saves: StylesheetSaves,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly followReference: (target: string) => Promise<void>,
    private readonly timer: OpenTimer,
    /** A measurement script is waiting: quit VS Code once the document is editable (ADR 0101). */
    private readonly quitWhenEditable: boolean,
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
    this.pushedWatch?.disposable.dispose();
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

  /** Asks the webview to time its actions; it sends no changes from then on (ADR 0101). */
  measureActions(runs: number): Promise<MeasuredActions> {
    return new Promise((done) => {
      this.actionsWaiter = done;
      this.enqueue(() => this.post({ type: 'measure-actions', runs }));
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
        this.timer.webviewReady();
        await this.sendInit();
        return;
      case 'action-timings':
        this.actionsWaiter?.({ timings: message.timings, applied: message.applied });
        this.actionsWaiter = undefined;
        return;
      case 'painted':
        if (this.timer.painted(message.stage) && message.stage === 'editable') {
          if (this.quitWhenEditable) await vscode.commands.executeCommand('workbench.action.quit');
        }
        return;
      case 'change':
        await this.apply(message.text);
        await this.postRound(undefined, false);
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
      case 'open-review':
        await this.openReview(message.key);
        return;
      case 'set-thread-status':
        try {
          await this.setThreadStatus(message.key, message.status);
        } finally {
          await this.post({ type: 'thread-status-done', key: message.key });
        }
        return;
      case 'review-push':
      case 'review-pull':
      case 'open-review-folder':
        // Outside the queue: the dialogs of a push or a pull wait for the person, and edits that
        // come meanwhile go on.
        void this.reviewAction(message);
        return;
      case undefined:
        return;
    }
  }

  /** Pushes, pulls or shows the review folder for the review buttons (ADR 0088). */
  private async reviewAction(
    message: Extract<
      WebviewMessage,
      { type: 'review-push' | 'review-pull' | 'open-review-folder' }
    >,
  ): Promise<void> {
    const state = this.context.workspaceState;
    const uri = this.document.uri;
    try {
      if (message.type === 'review-push') {
        await pushDocument(state, uri, message.mode);
      } else if (message.type === 'review-pull') {
        await pullDocument(state, uri, this.log);
      } else {
        const target = pushedFile(state, uri);
        const folder = rememberedFolder(state, uri);
        if (folder === undefined) {
          void vscode.window.showInformationMessage(
            'Stanza: this document has no review folder yet. Push it first.',
          );
        } else {
          const exists = await vscode.workspace.fs.stat(target ?? folder).then(
            () => true,
            () => false,
          );
          await vscode.commands.executeCommand('revealFileInOS', exists ? target : folder);
        }
      }
    } catch (error) {
      this.log.appendLine(error instanceof Error ? (error.stack ?? error.message) : String(error));
    } finally {
      if (!this.isDisposed()) {
        await this.post({ type: 'review-done' });
        this.enqueue(() => this.postRound(undefined, true));
      }
    }
  }

  /**
   * Tells the webview where the review round stands (ADR 0088), when that is new or asked for, and
   * watches the file in the review folder, which OneDrive changes when reviewers save it.
   */
  private async postRound(loaded: LoadedProject | undefined, force: boolean): Promise<void> {
    const root = this.root;
    if (root === undefined || this.shown !== 'editor') return;
    const project = loaded ?? this.loaded ?? (await this.diagnostics.load(root));
    this.loaded = project;
    const state = this.context.workspaceState;
    const path = posix.relative(root.path, this.document.uri.path);
    const status = await roundStatus(state, this.document.uri, project, path, this.text());
    const folder = rememberedFolder(state, this.document.uri);
    const message: HostMessage = {
      type: 'review-round',
      status,
      ...(folder !== undefined ? { folder: folderName(folder) } : {}),
    };
    this.watchPushed(pushedFile(state, this.document.uri));
    const key = JSON.stringify(message);
    if (!force && key === this.roundKey) return;
    this.roundKey = key;
    await this.post(message);
  }

  /** Watches the pushed file of the document, and no other, for the status of the round. */
  private watchPushed(file: vscode.Uri | undefined): void {
    const key = file?.toString();
    if (key === this.pushedWatch?.key) return;
    this.pushedWatch?.disposable.dispose();
    this.pushedWatch = undefined;
    if (file === undefined || key === undefined) return;
    const slash = file.path.lastIndexOf('/');
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        file.with({ path: file.path.slice(0, slash) }),
        file.path.slice(slash + 1),
      ),
    );
    const changed = (): void => {
      this.enqueue(() => this.postRound(undefined, false));
    };
    this.pushedWatch = {
      key,
      disposable: vscode.Disposable.from(
        watcher,
        watcher.onDidChange(changed),
        watcher.onDidCreate(changed),
        watcher.onDidDelete(changed),
      ),
    };
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
      await this.postRound(undefined, false);
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
    this.timer.initSent();
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
    this.imagesKey = undefined;
    await this.postImages(configuration.images);
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
    await this.postReviewThreads(loaded, root, true);
    await this.postRound(loaded, true);
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

  /**
   * Sends the threads of the review documents of this document (ADR 0086): every document of the
   * project whose `reviews` field names it, read back by the layout of ADR 0084.
   */
  private async postReviewThreads(
    loaded: LoadedProject,
    root: vscode.Uri,
    force: boolean,
  ): Promise<void> {
    const own = posix.relative(root.path, this.document.uri.path);
    // A Word comment pulled more than once is shown once, by its latest copy.
    const threads: ReviewThreadView[] = latestThreads(
      loaded.documents
        .filter((entry) => entry.document.meta.reviews === own)
        .flatMap((entry) =>
          reviewThreads(entry.path, entry.document).map((thread, index) => ({
            ...thread,
            key: `${thread.review}#${thread.headingId ?? String(index)}`,
          })),
        ),
    );
    const key = JSON.stringify(threads);
    if (!force && key === this.threadsKey) return;
    // A webview that was never sent threads has none, so an empty list need not be sent.
    const unchangedEmpty = threads.length === 0 && (this.threadsKey ?? '[]') === '[]';
    this.threadsKey = key;
    this.sentThreads = new Map(threads.map((thread) => [thread.key, thread]));
    if (unchangedEmpty) return;
    await this.post({ type: 'review-threads', threads });
  }

  /** Opens the review document of a thread in the Stanza editor, at the heading of the thread. */
  private async openReview(key: string): Promise<void> {
    const thread = this.sentThreads.get(key);
    const root = this.root;
    if (thread === undefined || root === undefined) {
      await vscode.window.showErrorMessage('Stanza: that review thread is not known any more.');
      return;
    }
    const own = posix.relative(root.path, this.document.uri.path);
    const file = posix.relative(posix.dirname(own), thread.review);
    await this.followReference(
      thread.headingId === undefined ? file : `${file}#${thread.headingId}`,
    );
  }

  /**
   * Resolves or reopens a thread (ADR 0086): changes the word of its status line in the buffer of
   * the review document, as an edit that can be undone, and saves it. A thread that is not as it
   * was sent is refused; a review document with unsaved changes of its own is saved only when the
   * author says so.
   */
  private async setThreadStatus(key: string, status: 'open' | 'resolved'): Promise<void> {
    const sent = this.sentThreads.get(key);
    const root = this.root;
    if (sent === undefined || root === undefined) {
      await vscode.window.showErrorMessage('Stanza: that review thread is not known any more.');
      return;
    }
    const verb = status === 'resolved' ? 'resolve' : 'reopen';
    const headingId = sent.headingId;
    if (headingId === undefined || !isNodeId(headingId)) {
      await vscode.window.showErrorMessage(
        `Stanza: the thread "${sent.title}" has no ID in ${sent.review}, so it cannot be ${verb}d from here. Change its status in the review document.`,
      );
      return;
    }
    const uri = uriInProject(root, sent.review);
    const review = await vscode.workspace.openTextDocument(uri);
    const text = normalized(review.getText());
    const parsed = parseDocument(text);
    const now = reviewThreads(sent.review, parsed.document).find(
      (thread) => thread.headingId === headingId,
    );
    if (now === undefined || JSON.stringify({ ...now, key }) !== JSON.stringify(sent)) {
      await vscode.window.showWarningMessage(
        `Stanza: the thread "${sent.title}" in ${sent.review} changed since it was shown, so it was not ${verb}d. Look at it again.`,
      );
      this.scheduleRefresh();
      return;
    }
    const change = threadStatusEdit(text, headingId, status);
    if (change === undefined) {
      if (now.status !== status) {
        await vscode.window.showErrorMessage(
          `Stanza: the status line of "${sent.title}" was not found in ${sent.review}.`,
        );
      }
      return;
    }
    if (review.isDirty) {
      const button = status === 'resolved' ? 'Save and Resolve' : 'Save and Reopen';
      const choice = await vscode.window.showWarningMessage(
        `${sent.review} has unsaved changes. Save it and ${verb} the thread?`,
        { modal: true },
        button,
      );
      if (choice !== button) return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      uri,
      new vscode.Range(change.line, change.start, change.line, change.end),
      change.text,
    );
    if (!(await vscode.workspace.applyEdit(edit))) {
      await vscode.window.showErrorMessage(`Stanza: ${sent.review} could not be changed.`);
      return;
    }
    if (!(await review.save())) {
      await vscode.window.showErrorMessage(`Stanza: ${sent.review} could not be saved.`);
    }
    this.scheduleRefresh();
  }

  /** Watches the files of the project, which can change without this document changing. */
  private watch(root: vscode.Uri): void {
    if (this.watched === root.toString()) return;
    this.watched = root.toString();
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '**/*.{yaml,yml,stanza.md,png,jpg,jpeg}'),
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

  /** Sends the images of the covers and title blocks when they differ from those sent last. */
  private async postImages(images: ReadonlyMap<string, ImageAsset>): Promise<void> {
    const urls = imageDataUrls(images);
    const key = JSON.stringify(urls);
    if (key === this.imagesKey) return;
    this.imagesKey = key;
    await this.post({ type: 'images', images: urls });
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
    await this.postImages(loaded.images);
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
    await this.postReviewThreads(loaded, root, false);
    await this.postRound(loaded, false);
  }
}

/** A folder as the person reads it: relative to the workspace when it is in it. */
const folderName = (folder: vscode.Uri): string => vscode.workspace.asRelativePath(folder);
