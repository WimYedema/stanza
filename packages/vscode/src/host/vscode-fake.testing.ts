import { posix } from 'node:path';
import { applyLineEdit, lineEdit } from './line-diff.js';

/**
 * A stand-in for the part of the VS Code API that the extension uses, with an in-memory file system
 * and one open document. Tests of the glue import `world` to set things up and to look at what the
 * extension did, and `vi.mock('vscode', createFakeVscode)` to give it the API. Not part of the
 * extension.
 */

export class FakeUri {
  constructor(readonly path: string) {}
  static parse(value: string): FakeUri {
    // A file URI, as `toString` writes it, comes back as the path; other addresses stay whole.
    return new FakeUri(value.startsWith('file://') ? value.slice('file://'.length) : value);
  }
  with(change: { readonly path?: string }): FakeUri {
    return new FakeUri(change.path ?? this.path);
  }
  static file(path: string): FakeUri {
    return new FakeUri(path);
  }
  static joinPath(base: FakeUri, ...parts: string[]): FakeUri {
    return new FakeUri(posix.join(base.path, ...parts));
  }
  toString(): string {
    return `file://${this.path}`;
  }
}

interface Listener<T> {
  (event: T): void;
}

interface FakeDocument {
  readonly uri: FakeUri;
  readonly fileName: string;
  getText(): string;
}

/** A file other than the document, once it has been opened: its text and whether it is saved. */
interface FakeFile extends FakeDocument {
  text: string;
  isDirty: boolean;
  save(): Promise<boolean>;
}

/** The state of the pretend VS Code. */
export const world = {
  /** Files by absolute path. */
  files: new Map<string, string>(),
  /** The files that were opened with `openTextDocument`, by absolute path. */
  open: new Map<string, FakeFile>(),
  saved: [] as string[],
  saveListeners: [] as Listener<FakeDocument>[],
  /** The workspace folder that the document is in. */
  workspace: '/w/p',
  document: undefined as FakeDocument | undefined,
  /** The text of the open document with `\n`, and its line ending. */
  text: '',
  eol: '\n',
  posted: [] as unknown[],
  edits: [] as { start: [number, number]; end: [number, number]; text: string }[],
  commands: [] as string[],
  commandHandlers: new Map<string, (...args: never[]) => unknown>(),
  codeActions: undefined as
    | { provideCodeActions(document: unknown, range: unknown, context: unknown): unknown[] }
    | undefined,
  errors: [] as string[],
  /** What the extension wants called when a panel is closed. */
  disposers: [] as (() => void)[],
  diagnostics: new Map<string, unknown[]>(),
  changeListeners: [] as Listener<{ document: FakeDocument; reason?: number | undefined }>[],
  openListeners: [] as Listener<FakeDocument>[],
  closeListeners: [] as Listener<FakeDocument>[],
  fileWatchers: [] as {
    pattern: unknown;
    change: Listener<FakeUri>[];
    create: Listener<FakeUri>[];
    delete: Listener<FakeUri>[];
  }[],
  messageListeners: [] as Listener<unknown>[],
  failEdits: false,
  /** What `stanza` settings say, by name. */
  settings: {} as Record<string, unknown>,
  /** The messages shown in the status bar. */
  status: [] as string[],
  /** Writing a file fails, like a DOCX that Word has open. */
  failWrites: false,
  /** The directories that were made. */
  directories: [] as string[],
  /** The editor that is in front, as the tab groups tell it. */
  activeTab: undefined as { input: unknown } | undefined,
  /** The arguments of the commands that were run, in the order of `commands`. */
  commandArgs: [] as unknown[][],
  /** The folder that the open dialog returns, or undefined for a dialog that is cancelled. */
  dialogFolder: undefined as string | undefined,
  /** What the input box returns, or undefined for one that is cancelled, and what it was asked. */
  inputValue: undefined as string | undefined,
  inputOptions: undefined as { value?: string; validateInput?(v: string): unknown } | undefined,
  /** The information messages shown, and the button that is pressed on them. */
  infos: [] as string[],
  infoChoice: undefined as string | undefined,
  /** The lists shown in quick picks, and which entry is picked (undefined: the pick is cancelled). */
  quickPicks: [] as unknown[][],
  quickPickIndex: 0 as number | undefined,
  /** The tree data providers that were registered, by view ID. */
  treeProviders: new Map<string, unknown>(),
  /** The warnings asked with buttons, and the button that is pressed on them. */
  warnings: [] as string[],
  warningChoice: undefined as string | undefined,
  /** The folders that the editor was opened on are not in the workspace. */
  outsideWorkspace: false,
  /** The files whose content is bytes, such as a DOCX, by absolute path. */
  binary: new Map<string, Uint8Array>(),
  /** Set in a remote window. */
  remoteName: undefined as string | undefined,
  /** The files handed to the system to open, and whether that works. */
  opened: [] as string[],
  failOpen: false,
};

export function reset(
  files: Record<string, string>,
  documentPath: string,
  text: string,
  eol = '\n',
): {
  uri: FakeUri;
} {
  // The panels of the test before are closed, so that nothing of them goes on in this one.
  for (const dispose of world.disposers) dispose();
  world.disposers = [];
  world.files = new Map(Object.entries(files));
  world.text = text;
  world.eol = eol;
  world.posted = [];
  world.edits = [];
  world.commands = [];
  world.commandHandlers = new Map();
  world.codeActions = undefined;
  world.errors = [];
  world.open = new Map();
  world.saved = [];
  world.saveListeners = [];
  world.diagnostics = new Map();
  world.changeListeners = [];
  world.openListeners = [];
  world.closeListeners = [];
  world.fileWatchers = [];
  world.messageListeners = [];
  world.failEdits = false;
  world.settings = {};
  world.status = [];
  world.failWrites = false;
  world.directories = [];
  world.activeTab = undefined;
  world.commandArgs = [];
  world.dialogFolder = undefined;
  world.inputValue = undefined;
  world.inputOptions = undefined;
  world.infos = [];
  world.infoChoice = undefined;
  world.quickPicks = [];
  world.quickPickIndex = 0;
  world.treeProviders = new Map();
  world.warnings = [];
  world.warningChoice = undefined;
  world.outsideWorkspace = false;
  world.remoteName = undefined;
  world.binary = new Map();
  world.opened = [];
  world.failOpen = false;
  const uri = new FakeUri(documentPath);
  world.document = {
    uri,
    fileName: documentPath,
    getText: () => world.text.replace(/\n/g, world.eol),
  };
  return { uri };
}

/** The document changes in a way that is not an edit of the extension, for example by a checkout. */
export function changeDocument(text: string, reason?: number): void {
  world.text = text;
  fire(world.document, reason);
}

function fire(document: FakeDocument | undefined = world.document, reason?: number): void {
  if (document === undefined) return;
  for (const listener of world.changeListeners) listener({ document, reason });
}

/** The person saves the document, which VS Code tells the extension about. */
export function saveDocument(): void {
  const document = world.document;
  if (document === undefined) return;
  for (const listener of [...world.saveListeners]) listener(document);
}

const disposable = (remove: () => void) => ({ dispose: remove });

function listen<T>(list: Listener<T>[], listener: Listener<T>) {
  list.push(listener);
  return disposable(() => {
    list.splice(list.indexOf(listener), 1);
  });
}

export function createFakeVscode(): Record<string, unknown> {
  class Range {
    readonly start: { line: number; character: number };
    readonly end: { line: number; character: number };
    constructor(a: number, b: number, c: number, d: number) {
      this.start = { line: a, character: b };
      this.end = { line: c, character: d };
    }
  }
  class WorkspaceEdit {
    readonly replaced: { uri: FakeUri; range: Range; text: string }[] = [];
    replace(uri: FakeUri, range: Range, text: string): void {
      this.replaced.push({ uri, range, text });
    }
  }
  class Diagnostic {
    code?: unknown;
    source?: string;
    constructor(
      readonly range: Range,
      readonly message: string,
      readonly severity: number,
    ) {}
  }
  class CodeAction {
    diagnostics?: Diagnostic[];
    command?: { command: string; title: string; arguments?: unknown[] };
    constructor(
      readonly title: string,
      readonly kind: string,
    ) {}
  }
  const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };
  class EventEmitter<T> {
    private readonly listeners: ((event: T) => void)[] = [];
    readonly event = (listener: (event: T) => void): ReturnType<typeof disposable> => {
      this.listeners.push(listener);
      return disposable(() => undefined);
    };
    fire(event: T): void {
      for (const listener of this.listeners) listener(event);
    }
    dispose(): void {
      this.listeners.length = 0;
    }
  }
  class TreeItem {
    id?: string;
    description?: string;
    iconPath?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };
    constructor(
      readonly label: string,
      readonly collapsibleState = 0,
    ) {}
  }
  class ThemeIcon {
    constructor(readonly id: string) {}
  }
  const exists = (path: string): boolean =>
    world.files.has(path) || [...world.files.keys()].some((file) => file.startsWith(`${path}/`));

  return {
    Uri: FakeUri,
    Range,
    WorkspaceEdit,
    Diagnostic,
    CodeAction,
    CodeActionKind: { QuickFix: 'quickfix' },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    FileType,
    EventEmitter,
    TreeItem,
    ThemeIcon,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    UIKind: { Desktop: 1, Web: 2 },
    TextDocumentChangeReason: { Undo: 1, Redo: 2 },
    env: {
      get remoteName() {
        return world.remoteName;
      },
      uiKind: 1,
      openExternal: (uri: FakeUri) => {
        world.opened.push(uri.path);
        return Promise.resolve(!world.failOpen);
      },
    },
    TabInputText: class {
      constructor(readonly uri: FakeUri) {}
    },
    TabInputCustom: class {
      constructor(
        readonly uri: FakeUri,
        readonly viewType: string,
      ) {}
    },
    RelativePattern: class {
      constructor(
        readonly base: FakeUri,
        readonly pattern: string,
      ) {}
    },
    Disposable: class {
      constructor(private readonly done: () => void) {}
      static from(...items: readonly { dispose(): unknown }[]): { dispose(): void } {
        return {
          dispose: () => {
            for (const item of items) item.dispose();
          },
        };
      }
      dispose(): void {
        this.done();
      }
    },
    // No extensions are installed, so there is no Git: documents are stamped without a revision.
    extensions: { getExtension: () => undefined },
    workspace: {
      fs: {
        stat: (uri: FakeUri) =>
          exists(uri.path) ? Promise.resolve({}) : Promise.reject(new Error(`No ${uri.path}`)),
        readFile: (uri: FakeUri) => {
          const binary = world.binary.get(uri.path);
          if (binary !== undefined) return Promise.resolve(binary);
          const text = world.files.get(uri.path);
          return text === undefined
            ? Promise.reject(new Error(`No ${uri.path}`))
            : Promise.resolve(new TextEncoder().encode(text));
        },
        readDirectory: (uri: FakeUri) => {
          const prefix = `${uri.path}/`;
          const entries = new Map<string, number>();
          for (const file of world.files.keys()) {
            if (!file.startsWith(prefix)) continue;
            const [name = '', ...rest] = file.slice(prefix.length).split('/');
            entries.set(name, rest.length > 0 ? FileType.Directory : FileType.File);
          }
          return Promise.resolve([...entries]);
        },
        writeFile: (uri: FakeUri, content: Uint8Array) => {
          if (world.failWrites) return Promise.reject(new Error('EBUSY: resource busy or locked'));
          world.files.set(uri.path, new TextDecoder().decode(content));
          // The bytes too, so that a DOCX that is written can be read back as it was.
          world.binary.set(uri.path, content);
          return Promise.resolve();
        },
        createDirectory: (uri: FakeUri) => {
          world.directories.push(uri.path);
          return Promise.resolve();
        },
      },
      getConfiguration: () => ({
        get: (name: string, fallback: unknown) => world.settings[name] ?? fallback,
      }),
      getWorkspaceFolder: () =>
        world.outsideWorkspace ? undefined : { uri: new FakeUri(world.workspace) },
      findFiles: (pattern: string) => {
        const name = pattern.slice(pattern.lastIndexOf('/') + 1);
        return Promise.resolve(
          [...world.files.keys()]
            .filter((path) => path.endsWith(`/${name}`))
            .map((p) => new FakeUri(p)),
        );
      },
      asRelativePath: (uri: FakeUri) => posix.relative(world.workspace, uri.path),
      get textDocuments() {
        return world.document === undefined ? [] : [world.document, ...world.open.values()];
      },
      openTextDocument: (uri: FakeUri) => {
        const known = world.open.get(uri.path);
        if (known !== undefined) return Promise.resolve(known);
        const text = world.files.get(uri.path);
        if (text === undefined) return Promise.reject(new Error(`No ${uri.path}`));
        const file: FakeFile = {
          uri,
          fileName: uri.path,
          text,
          isDirty: false,
          getText: () => file.text,
          save: () => {
            world.files.set(uri.path, file.text);
            world.saved.push(uri.path);
            file.isDirty = false;
            return Promise.resolve(true);
          },
        };
        world.open.set(uri.path, file);
        return Promise.resolve(file);
      },
      onDidSaveTextDocument: (listener: Listener<FakeDocument>) =>
        listen(world.saveListeners, listener),
      onDidChangeTextDocument: (
        listener: Listener<{ document: FakeDocument; reason?: number | undefined }>,
      ) => listen(world.changeListeners, listener),
      onDidOpenTextDocument: (listener: Listener<FakeDocument>) =>
        listen(world.openListeners, listener),
      onDidCloseTextDocument: (listener: Listener<FakeDocument>) =>
        listen(world.closeListeners, listener),
      onDidChangeWorkspaceFolders: () => disposable(() => undefined),
      createFileSystemWatcher: (pattern: unknown) => {
        const watcher: (typeof world.fileWatchers)[number] = {
          pattern,
          change: [],
          create: [],
          delete: [],
        };
        world.fileWatchers.push(watcher);
        return {
          onDidChange: (listener: Listener<FakeUri>) => listen(watcher.change, listener),
          onDidCreate: (listener: Listener<FakeUri>) => listen(watcher.create, listener),
          onDidDelete: (listener: Listener<FakeUri>) => listen(watcher.delete, listener),
          dispose: () => undefined,
        };
      },
      applyEdit: (edit: WorkspaceEdit) => {
        if (world.failEdits) return Promise.resolve(false);
        for (const { uri, range, text } of edit.replaced) {
          const target = world.open.get(uri.path);
          const change = {
            start: [range.start.line, range.start.character] as [number, number],
            end: [range.end.line, range.end.character] as [number, number],
            text,
          };
          const lineEdit = {
            start: { line: change.start[0], character: change.start[1] },
            end: { line: change.end[0], character: change.end[1] },
            text,
          };
          if (target !== undefined) {
            target.text = applyLineEdit(target.text, lineEdit);
            target.isDirty = true;
            fire(target);
            continue;
          }
          world.edits.push(change);
          world.text = applyLineEdit(world.text, lineEdit);
          fire();
        }
        return Promise.resolve(true);
      },
    },
    window: {
      createOutputChannel: () => ({ appendLine: () => undefined, dispose: () => undefined }),
      setStatusBarMessage: (text: string) => {
        world.status.push(text);
        return disposable(() => undefined);
      },
      registerCustomEditorProvider: () => disposable(() => undefined),
      registerTreeDataProvider: (id: string, provider: unknown) => {
        world.treeProviders.set(id, provider);
        return disposable(() => undefined);
      },
      get tabGroups() {
        return { activeTabGroup: { activeTab: world.activeTab } };
      },
      showQuickPick: (items: readonly unknown[]) => {
        world.quickPicks.push([...items]);
        return Promise.resolve(
          world.quickPickIndex === undefined ? undefined : items[world.quickPickIndex],
        );
      },
      showOpenDialog: () =>
        Promise.resolve(
          world.dialogFolder === undefined ? undefined : [new FakeUri(world.dialogFolder)],
        ),
      showInputBox: (options: typeof world.inputOptions) => {
        world.inputOptions = options;
        return Promise.resolve(world.inputValue);
      },
      showInformationMessage: (message: string) => {
        world.infos.push(message);
        return Promise.resolve(world.infoChoice);
      },
      showWarningMessage: (message: string) => {
        world.warnings.push(message);
        return Promise.resolve(world.warningChoice);
      },
      showErrorMessage: (message: string) => {
        world.errors.push(message);
        return Promise.resolve(undefined);
      },
    },
    languages: {
      registerCodeActionsProvider: (_selector: unknown, provider: typeof world.codeActions) => {
        world.codeActions = provider;
        return disposable(() => undefined);
      },
      createDiagnosticCollection: () => ({
        set: (uri: FakeUri, entries: unknown[]) => world.diagnostics.set(uri.path, entries),
        delete: (uri: FakeUri) => world.diagnostics.delete(uri.path),
        dispose: () => undefined,
      }),
    },
    commands: {
      registerCommand: (command: string, handler: (...args: never[]) => unknown) => {
        world.commandHandlers.set(command, handler);
        return disposable(() => undefined);
      },
      executeCommand: (command: string, ...args: unknown[]) => {
        world.commandArgs.push(args);
        world.commands.push(command);
        return Promise.resolve();
      },
    },
  };
}

/** The panel of a webview, which records what the extension posts and plays what the webview sends. */
export function fakePanel() {
  return {
    webview: {
      options: undefined as unknown,
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri: FakeUri) => uri,
      onDidReceiveMessage: (listener: Listener<unknown>) =>
        listen(world.messageListeners, listener),
      postMessage: (message: unknown) => {
        world.posted.push(message);
        return Promise.resolve(true);
      },
    },
    onDidDispose: (listener: () => void) => {
      world.disposers.push(listener);
      return disposable(() => undefined);
    },
  };
}

/** The webview sends a message. */
export function fromWebview(message: unknown): void {
  for (const listener of world.messageListeners) listener(message);
}

export { lineEdit };
