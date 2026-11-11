import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { OPEN_AT_COMMAND, OUTLINE_VIEW, PhraseTree, registerPhraseTree } from './phrase-tree.js';
import type { PhraseEditorProvider } from './provider.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `phrase-format: 1
title: 'Example'
stylesheet: 'styles/default.yaml'
`;
const STYLESHEET = `phrase-format: 1
paragraph-styles:
  body: {}
  heading-1:
    numbered: true
  heading-2:
    based-on: heading-1
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
const FRONT = (title: string): string => `---\nphrase-format: 1\ntitle: "${title}"\n---\n\n`;
const INTRO = `${FRONT('Introduction')}# Scope\n\nText.\n\n## Aim\n\n# Method\n`;
const REFERENCE = `${FRONT('Reference')}# Terms\n`;

const files = (extra: Record<string, string> = {}): Record<string, string> => ({
  '/w/p/phrase.yaml': PROJECT,
  '/w/p/styles/default.yaml': STYLESHEET,
  '/w/p/documents/introduction.phrase.md': INTRO,
  '/w/p/documents/reference.phrase.md': REFERENCE,
  ...extra,
});

type Node = Awaited<ReturnType<PhraseTree['getChildren']>>[number];

const open = vi.fn<(uri: vscode.Uri, block?: number) => Promise<void>>(() => Promise.resolve());
let registered: vscode.Disposable | undefined;

function show(projectFiles = files()): PhraseTree {
  reset(projectFiles, '/w/p/documents/introduction.phrase.md', INTRO);
  registered = registerPhraseTree({ open } as unknown as PhraseEditorProvider);
  return world.treeProviders.get(OUTLINE_VIEW) as PhraseTree;
}

function only(nodes: readonly Node[], index = 0): Node {
  const node = nodes[index];
  if (node === undefined) throw new Error(`The tree has no node ${String(index)}.`);
  return node;
}

/** The labels, descriptions and commands of the children of a node. */
async function listing(tree: PhraseTree, node?: Node) {
  const children = await tree.getChildren(node);
  return children.map((child) => {
    const item = tree.getTreeItem(child);
    return { label: item.label, description: item.description, command: item.command };
  });
}

beforeEach(() => {
  open.mockClear();
});
afterEach(() => {
  registered?.dispose();
  registered = undefined;
  vi.useRealTimers();
});

describe('the Phrase tree', () => {
  it('shows the project by its title, then its documents, then the headings with numbers', async () => {
    const tree = show();
    const project = only(await tree.getChildren());
    expect(tree.getTreeItem(project).label).toBe('Example');
    expect(await listing(tree, project)).toEqual([
      expect.objectContaining({ label: 'Introduction', description: 'introduction.phrase.md' }),
      expect.objectContaining({ label: 'Reference', description: 'reference.phrase.md' }),
    ]);
    const introduction = only(await tree.getChildren(project));
    expect(await listing(tree, introduction)).toEqual([
      expect.objectContaining({ label: '1 Scope' }),
      expect.objectContaining({ label: '2 Method' }),
    ]);
    const scope = only(await tree.getChildren(introduction));
    expect(await listing(tree, scope)).toEqual([expect.objectContaining({ label: '1.1 Aim' })]);
  });

  it('opens a document at its heading when a heading is clicked, and at its start for a document', async () => {
    const tree = show();
    const introduction = only(await tree.getChildren(only(await tree.getChildren())));
    const document = tree.getTreeItem(introduction).command;
    expect(document?.command).toBe(OPEN_AT_COMMAND);
    expect(document?.arguments).toHaveLength(1);
    const method = tree.getTreeItem(only(await tree.getChildren(introduction), 1)).command;
    expect(method?.command).toBe(OPEN_AT_COMMAND);
    expect(method?.arguments?.[1]).toBe(3);
    expect((method?.arguments?.[0] as vscode.Uri).path).toBe(
      '/w/p/documents/introduction.phrase.md',
    );
  });

  it('runs the command by asking the editors to open the document at the block', async () => {
    show();
    const handler = world.commandHandlers.get(OPEN_AT_COMMAND) as (
      uri: vscode.Uri,
      block?: number,
    ) => Promise<void>;
    const uri = { path: '/w/p/documents/introduction.phrase.md' } as vscode.Uri;
    await handler(uri, 4);
    await handler(uri);
    expect(open.mock.calls).toEqual([
      [uri, 4],
      [uri, undefined],
    ]);
  });

  it('says that there is no project when the workspace has none', async () => {
    const tree = show({});
    expect(await listing(tree)).toEqual([
      expect.objectContaining({ label: 'No Phrase project in the workspace' }),
    ]);
    expect(await tree.getChildren(only(await tree.getChildren()))).toEqual([]);
  });

  it('marks a project that has errors, and shows no documents for it', async () => {
    const tree = show(files({ '/w/p/styles/default.yaml': 'phrase-format: 1\nbad: [' }));
    const project = only(await tree.getChildren());
    expect(tree.getTreeItem(project).description).toBe('has errors');
    expect(await tree.getChildren(project)).toEqual([]);
  });

  it('is made again after a change to a document, when nothing changes for a moment', () => {
    vi.useFakeTimers();
    const tree = show();
    const changed = vi.fn();
    tree.onDidChangeTreeData(changed);
    for (const listener of world.changeListeners) {
      listener({ document: { fileName: '/w/p/documents/introduction.phrase.md' } as never });
      listener({ document: { fileName: '/w/p/documents/introduction.phrase.md' } as never });
    }
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('ignores changes to other files', () => {
    vi.useFakeTimers();
    const tree = show();
    const changed = vi.fn();
    tree.onDidChangeTreeData(changed);
    for (const listener of world.changeListeners) {
      listener({ document: { fileName: '/w/p/notes.txt' } as never });
    }
    vi.advanceTimersByTime(400);
    expect(changed).not.toHaveBeenCalled();
  });
});
