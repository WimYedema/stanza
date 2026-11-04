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
  changeListeners: [] as Listener<{ document: FakeDocument }>[],
  messageListeners: [] as Listener<unknown>[],
  failEdits: false,
  /** What `phrase` settings say, by name. */
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
  world.messageListeners = [];
  world.failEdits = false;
  world.settings = {};
  world.status = [];
  world.failWrites = false;
  world.directories = [];
  world.activeTab = undefined;
  world.commandArgs = [];
  const uri = new FakeUri(documentPath);
  world.document = {
    uri,
    fileName: documentPath,
    getText: () => world.text.replace(/\n/g, world.eol),
  };
  return { uri };
}

/** The document changes in a way that is not an edit of the extension, for example by a checkout. */
export function changeDocument(text: string): void {
  world.text = text;
  fire();
}

function fire(document: FakeDocument | undefined = world.document): void {
  if (document === undefined) return;
  for (const listener of world.changeListeners) listener({ document });
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
    workspace: {
      fs: {
        stat: (uri: FakeUri) =>
          exists(uri.path) ? Promise.resolve({}) : Promise.reject(new Error(`No ${uri.path}`)),
        readFile: (uri: FakeUri) => {
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
      getWorkspaceFolder: () => ({ uri: new FakeUri(world.workspace) }),
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
      onDidChangeTextDocument: (listener: Listener<{ document: FakeDocument }>) =>
        listen(world.changeListeners, listener),
      createFileSystemWatcher: () => ({
        onDidChange: () => disposable(() => undefined),
        onDidCreate: () => disposable(() => undefined),
        onDidDelete: () => disposable(() => undefined),
        dispose: () => undefined,
      }),
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
      get tabGroups() {
        return { activeTabGroup: { activeTab: world.activeTab } };
      },
      showQuickPick: (items: readonly unknown[]) => Promise.resolve(items[0]),
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
