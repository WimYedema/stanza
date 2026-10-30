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

/** The state of the pretend VS Code. */
export const world = {
  /** Files by absolute path. */
  files: new Map<string, string>(),
  /** The workspace folder that the document is in. */
  workspace: '/w/p',
  document: undefined as FakeDocument | undefined,
  /** The text of the open document with `\n`, and its line ending. */
  text: '',
  eol: '\n',
  posted: [] as unknown[],
  edits: [] as { start: [number, number]; end: [number, number]; text: string }[],
  commands: [] as string[],
  diagnostics: new Map<string, unknown[]>(),
  changeListeners: [] as Listener<{ document: FakeDocument }>[],
  messageListeners: [] as Listener<unknown>[],
  failEdits: false,
};

export function reset(
  files: Record<string, string>,
  documentPath: string,
  text: string,
  eol = '\n',
): {
  uri: FakeUri;
} {
  world.files = new Map(Object.entries(files));
  world.text = text;
  world.eol = eol;
  world.posted = [];
  world.edits = [];
  world.commands = [];
  world.diagnostics = new Map();
  world.changeListeners = [];
  world.messageListeners = [];
  world.failEdits = false;
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

function fire(): void {
  const document = world.document;
  if (document === undefined) return;
  for (const listener of world.changeListeners) listener({ document });
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
  const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };
  const exists = (path: string): boolean =>
    world.files.has(path) || [...world.files.keys()].some((file) => file.startsWith(`${path}/`));

  return {
    Uri: FakeUri,
    Range,
    WorkspaceEdit,
    Diagnostic,
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    FileType,
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
          world.files.set(uri.path, new TextDecoder().decode(content));
          return Promise.resolve();
        },
      },
      getWorkspaceFolder: () => ({ uri: new FakeUri(world.workspace) }),
      get textDocuments() {
        return world.document === undefined ? [] : [world.document];
      },
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
        for (const { range, text } of edit.replaced) {
          const change = {
            start: [range.start.line, range.start.character] as [number, number],
            end: [range.end.line, range.end.character] as [number, number],
            text,
          };
          world.edits.push(change);
          world.text = applyLineEdit(world.text, {
            start: { line: change.start[0], character: change.start[1] },
            end: { line: change.end[0], character: change.end[1] },
            text,
          });
        }
        fire();
        return Promise.resolve(true);
      },
    },
    window: {
      createOutputChannel: () => ({ appendLine: () => undefined, dispose: () => undefined }),
      registerCustomEditorProvider: () => disposable(() => undefined),
    },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: FakeUri, entries: unknown[]) => world.diagnostics.set(uri.path, entries),
        delete: (uri: FakeUri) => world.diagnostics.delete(uri.path),
        dispose: () => undefined,
      }),
    },
    commands: {
      executeCommand: (command: string) => {
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
    onDidDispose: () => disposable(() => undefined),
  };
}

/** The webview sends a message. */
export function fromWebview(message: unknown): void {
  for (const listener of world.messageListeners) listener(message);
}

export { lineEdit };
