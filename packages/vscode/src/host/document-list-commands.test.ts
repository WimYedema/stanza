import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { parseProject } from '@stanza/format';
import { StylesheetSaves } from './declare-variant.js';
import {
  FIX_DOCUMENT_LIST_COMMAND,
  INITIALIZE_DOCUMENT_LIST_COMMAND,
  MOVE_DOCUMENT_DOWN_COMMAND,
  MOVE_DOCUMENT_UP_COMMAND,
  REGROUP_DOCUMENT_COMMAND,
  registerDocumentListCommands,
} from './document-list-commands.js';
import { NEW_DOCUMENT_COMMAND, registerNewDocument } from './new-document-command.js';
import { StanzaTree } from './stanza-tree.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { registerDeclareVariant } from './quick-fix.js';
import { FakeUri, reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const ROOT = '/w/p';
const FILE = `${ROOT}/stanza.yaml`;
const A = 'documents/a.stanza.md';
const B = 'documents/b.stanza.md';
const PROJECT = "stanza-format: 1\nstylesheet: 'styles/default.yaml' # keep\n";
const FRONT = '---\nstanza-format: 1\n---\n\n';
const STYLES = `stanza-format: 1
paragraph-styles:
  body: {}
  heading-1: {}
  heading-2: {}
  heading-3: {}
  heading-4: {}
  heading-5: {}
  heading-6: {}
  code: {}
  list-bulleted: {}
  list-numbered: {}
table-styles:
  table: {}
`;
const root = new FakeUri(ROOT);
let diagnostics: ProjectDiagnostics;
let subscriptions: vscode.Disposable[];

async function run(command: string, ...args: unknown[]): Promise<void> {
  const handler = world.commandHandlers.get(command);
  if (handler === undefined) throw new Error('Command not registered.');
  await (handler as (...values: unknown[]) => Promise<void>)(...args);
}

function setup(outline = ''): void {
  reset(
    {
      [FILE]: PROJECT + outline,
      [`${ROOT}/styles/default.yaml`]: STYLES,
      [`${ROOT}/${A}`]: `${FRONT}<!-- stanza: #aaaaaaaaaa -->\n# A\n`,
      [`${ROOT}/${B}`]: `${FRONT}<!-- stanza: #bbbbbbbbbb -->\n# B\n`,
    },
    `${ROOT}/${A}`,
    `${FRONT}<!-- stanza: #aaaaaaaaaa -->\n# A\n`,
  );
  diagnostics = new ProjectDiagnostics();
  subscriptions = registerDocumentListCommands(diagnostics);
}

const buffer = (): string => world.open.get(FILE)?.text ?? world.files.get(FILE) ?? '';
const target = (path = A) => ({ kind: 'document', root, document: { path } });

beforeEach(() => {
  setup();
});

afterEach(() => {
  for (const subscription of subscriptions) subscription.dispose();
  diagnostics.dispose();
  vi.restoreAllMocks();
});

describe('document-list commands', () => {
  it('initializes from the palette, as an undoable edit with an explicit save option', async () => {
    world.infoChoice = 'Save project file';
    await run(INITIALIZE_DOCUMENT_LIST_COMMAND);
    expect(parseProject(world.files.get(FILE) ?? '').settings.documents).toEqual([
      { kind: 'document', path: A },
      { kind: 'document', path: B },
    ]);
    expect(world.saved).toEqual([FILE]);
    const saved = world.files.get(FILE);
    await run(INITIALIZE_DOCUMENT_LIST_COMMAND);
    expect(world.errors.at(-1)).toContain('already has');
    expect(world.files.get(FILE)).toBe(saved);
  });

  it('reorders and regroups a real tree document, refreshing the cached tree from the edited buffer', async () => {
    diagnostics.dispose();
    setup(`documents:\n  - ${A}\n  - ${B}\n  - group: Part two\n    items: []\n`);
    const tree = new StanzaTree(diagnostics);
    subscriptions.push(tree);
    const project = (await tree.getChildren())[0];
    if (project?.kind !== 'project') throw new Error('Missing project node.');
    const first = (await tree.getChildren(project))[0];
    if (first?.kind !== 'document') throw new Error('Missing document node.');
    expect(tree.getTreeItem(first).contextValue).toBe('stanzaDocument');
    await run(MOVE_DOCUMENT_DOWN_COMMAND, first);
    expect(parseProject(buffer()).settings.documents?.[0]).toEqual({
      kind: 'document',
      path: B,
    });
    await run(MOVE_DOCUMENT_UP_COMMAND, first);
    expect(parseProject(buffer()).settings.documents?.[0]).toEqual({
      kind: 'document',
      path: A,
    });
    world.quickPickIndex = 1;
    await run(REGROUP_DOCUMENT_COMMAND, first);
    const reloaded = (await tree.getChildren())[0];
    if (reloaded?.kind !== 'project') throw new Error('Missing project node.');
    expect((await tree.getChildren(reloaded)).map((node) => tree.getTreeItem(node).label)).toEqual([
      'b',
      'Part two',
    ]);
    expect(buffer()).toContain("stylesheet: 'styles/default.yaml' # keep");
    expect(world.files.get(FILE)).not.toBe(buffer());
    expect(world.saved).toEqual([]);
    expect(world.errors).toEqual([]);
  });

  it('includes existing unsaved project settings without saving or overwriting them', async () => {
    const document = await vscode.workspace.openTextDocument(new FakeUri(FILE) as vscode.Uri);
    const open = world.open.get(FILE);
    if (open === undefined) throw new Error('Missing project buffer.');
    open.text = `${document.getText()}title: 'Unsaved title'\n`;
    open.isDirty = true;
    await run(INITIALIZE_DOCUMENT_LIST_COMMAND, { root });
    expect(buffer()).toContain("title: 'Unsaved title'");
    expect(buffer()).toContain('documents:');
    expect(world.files.get(FILE)).toBe(PROJECT);
    expect(world.infos.at(-1)).toContain('Save the project file');
  });

  it('reports a failed explicit save while retaining the undoable project edit', async () => {
    const document = await vscode.workspace.openTextDocument(new FakeUri(FILE) as vscode.Uri);
    vi.spyOn(document, 'save').mockRejectedValueOnce(new Error('Read-only file'));
    world.infoChoice = 'Save project file';
    await run(INITIALIZE_DOCUMENT_LIST_COMMAND);
    await vi.waitFor(() => {
      expect(world.errors.at(-1)).toContain('Read-only file');
    });
    expect(buffer()).toContain('documents:');
    expect(world.files.get(FILE)).toBe(PROJECT);
  });

  it('updates the live project buffer when New Document creates a file', async () => {
    diagnostics.dispose();
    setup(`documents: [${A}, ${B}]\n`);
    subscriptions.push(registerNewDocument());
    world.inputValue = 'Notes';
    await run(NEW_DOCUMENT_COMMAND);
    expect(world.files.get(`${ROOT}/documents/notes.stanza.md`)).toContain('# Notes');
    expect(parseProject(buffer()).settings.documents?.at(-1)).toEqual({
      kind: 'document',
      path: 'documents/notes.stanza.md',
    });
    expect(world.files.get(FILE)).not.toContain('notes.stanza.md');
    expect(world.errors).toEqual([]);
  });

  it('does not delay opening a new document while the save reminder is visible', async () => {
    diagnostics.dispose();
    setup(`documents: [${A}, ${B}]\n`);
    const notification: { close: () => void } = { close: () => undefined };
    vi.spyOn(vscode.window, 'showInformationMessage').mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          notification.close = () => {
            resolve(undefined);
          };
        }),
    );
    subscriptions.push(registerNewDocument());
    world.inputValue = 'Notes';
    await run(NEW_DOCUMENT_COMMAND);
    expect(world.commands).toContain('vscode.openWith');
    expect(buffer()).toContain('documents/notes.stanza.md');
    notification.close();
  });

  it('offers and applies unlisted/missing quick fixes, requiring confirmation for removal', async () => {
    diagnostics.dispose();
    setup(`documents:\n  - ${A}\n  - gone.stanza.md # investigate\n`);
    const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;
    const saves = new StylesheetSaves(log);
    subscriptions.push(saves, ...registerDeclareVariant(diagnostics, saves));
    await diagnostics.refresh(root as vscode.Uri);
    const actions = (path: string) =>
      world.codeActions?.provideCodeActions({ uri: new FakeUri(path) }, undefined, {
        diagnostics: world.diagnostics.get(path),
      }) as { title: string; command?: { command: string; arguments?: unknown[] } }[];
    const add = actions(`${ROOT}/${B}`)[0];
    expect(add?.command?.command).toBe(FIX_DOCUMENT_LIST_COMMAND);
    await run(FIX_DOCUMENT_LIST_COMMAND, ...(add?.command?.arguments ?? []));
    expect(parseProject(buffer()).settings.documents?.at(-1)).toEqual({
      kind: 'document',
      path: B,
    });
    const remove = actions(FILE)[0];
    expect(remove?.title).toContain('Remove missing');
    const before = buffer();
    await run(FIX_DOCUMENT_LIST_COMMAND, ...(remove?.command?.arguments ?? []));
    expect(buffer()).toBe(before);
    world.warningChoice = 'Remove entry';
    await run(FIX_DOCUMENT_LIST_COMMAND, ...(remove?.command?.arguments ?? []));
    expect(buffer()).not.toContain('gone.stanza.md');
    expect(buffer()).toContain('# investigate');
    expect(world.files.has(`${ROOT}/${A}`)).toBe(true);
    expect(world.files.has(`${ROOT}/${B}`)).toBe(true);
    await run(FIX_DOCUMENT_LIST_COMMAND, ...(remove?.command?.arguments ?? []));
    expect(world.errors.at(-1)).toContain('no longer applicable');
  });

  it('rejects invalid context, cancelled picks, stale group choices and failed edits without changing the list', async () => {
    diagnostics.dispose();
    setup(`documents: [${A}, ${B}]\n`);
    const before = buffer();
    await run(MOVE_DOCUMENT_UP_COMMAND, undefined);
    expect(world.errors.at(-1)).toContain('Choose a document');
    await run(MOVE_DOCUMENT_UP_COMMAND, target());
    expect(world.errors.at(-1)).toContain('cannot move up');
    world.quickPickIndex = undefined;
    await run(REGROUP_DOCUMENT_COMMAND, target());
    expect(buffer()).toBe(before);
    const choice = { label: 'Project root', trail: [] };
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementationOnce(() => {
      const open = world.open.get(FILE);
      if (open === undefined) throw new Error('Missing project buffer.');
      open.text = `${before}# newer\n`;
      open.isDirty = true;
      return Promise.resolve(choice);
    });
    await run(REGROUP_DOCUMENT_COMMAND, target());
    expect(world.errors.at(-1)).toContain('changed');
    expect(buffer()).toBe(`${before}# newer\n`);
    world.failEdits = true;
    await run(MOVE_DOCUMENT_DOWN_COMMAND, target());
    expect(world.errors.at(-1)).toContain('not applied');
    expect(buffer()).toBe(`${before}# newer\n`);
    expect(world.files.get(FILE)).toBe(before);
  });
});
