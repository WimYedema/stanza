import * as vscode from 'vscode';
import { loadProject } from '@phrase/project';
import type { HeadingNode } from './headings.js';
import { outlineOf, type OutlineDocument, type OutlineGroup, type OutlineItem } from './outline.js';
import { storageOf, uriInProject } from './project-files.js';
import type { PhraseEditorProvider } from './provider.js';

export const OUTLINE_VIEW = 'phrase.outline';
/** The command that a click in the tree runs: opens a document, at a block when one is given. */
export const OPEN_AT_COMMAND = 'phrase.openAt';

/** After a change, the tree is made again when nothing has changed for this long. */
const REFRESH_DELAY_MS = 300;

type Node =
  | {
      readonly kind: 'project';
      readonly root: vscode.Uri;
      readonly title: string;
      readonly inOrder: boolean;
      readonly items: readonly OutlineItem[];
    }
  | {
      readonly kind: 'group';
      readonly root: vscode.Uri;
      readonly group: OutlineGroup;
      /** Where the group is in the outline, to tell it from the others. */
      readonly trail: string;
    }
  | {
      readonly kind: 'document';
      readonly uri: vscode.Uri;
      readonly document: OutlineDocument;
      readonly alone: boolean;
    }
  | { readonly kind: 'heading'; readonly uri: vscode.Uri; readonly heading: HeadingNode }
  | { readonly kind: 'none' };

const folderName = (root: vscode.Uri): string => root.path.slice(root.path.lastIndexOf('/') + 1);

/** The node of an entry of the outline: a document, or a group with its entries below it. */
function nodeOf(root: vscode.Uri, item: OutlineItem, alone: boolean, trail: string): Node {
  if (item.kind === 'group') return { kind: 'group', root, group: item, trail };
  return { kind: 'document', uri: uriInProject(root, item.path), document: item, alone };
}

/** The projects of the workspace, their documents and the headings of each (item 111). */
export class PhraseTree implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  refresh(): void {
    this.changed.fire(undefined);
  }

  dispose(): void {
    this.changed.dispose();
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node === undefined) return this.projects();
    switch (node.kind) {
      case 'project':
        return node.items.map((item, index) =>
          nodeOf(node.root, item, node.items.length === 1, String(index)),
        );
      case 'group':
        return node.group.items.map((item, index) =>
          nodeOf(node.root, item, false, `${node.trail}.${String(index)}`),
        );
      case 'document':
        return node.document.headings.map((heading) => ({
          kind: 'heading',
          uri: node.uri,
          heading,
        }));
      case 'heading':
        return node.heading.children.map((heading) => ({
          kind: 'heading',
          uri: node.uri,
          heading,
        }));
      case 'none':
        return [];
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'project': {
        const item = new vscode.TreeItem(node.title, vscode.TreeItemCollapsibleState.Expanded);
        item.id = node.root.toString();
        item.iconPath = new vscode.ThemeIcon('root-folder');
        if (!node.inOrder) item.description = 'has errors';
        return item;
      }
      case 'group': {
        const item = new vscode.TreeItem(
          node.group.title,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.id = `${node.root.toString()}#group:${node.trail}`;
        item.iconPath = new vscode.ThemeIcon('folder');
        return item;
      }
      case 'document': {
        const item = new vscode.TreeItem(
          node.document.title,
          node.alone || node.document.headings.length === 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = node.uri.toString();
        const file = node.document.path.slice(node.document.path.lastIndexOf('/') + 1);
        item.description = node.document.listed ? file : `${file} (not listed)`;
        item.iconPath = new vscode.ThemeIcon('file');
        item.command = { command: OPEN_AT_COMMAND, title: 'Open', arguments: [node.uri] };
        return item;
      }
      case 'heading': {
        const { heading, uri } = node;
        const label =
          heading.number === undefined ? heading.title : `${heading.number} ${heading.title}`;
        const item = new vscode.TreeItem(
          label,
          heading.children.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
        );
        item.id = `${uri.toString()}#${String(heading.block)}`;
        item.command = {
          command: OPEN_AT_COMMAND,
          title: 'Go to heading',
          arguments: [uri, heading.block],
        };
        return item;
      }
      case 'none': {
        const item = new vscode.TreeItem('No Phrase project in the workspace');
        item.description = 'a folder with a phrase.yaml file';
        return item;
      }
    }
  }

  private async projects(): Promise<Node[]> {
    const found = await vscode.workspace.findFiles('**/phrase.yaml', '**/node_modules/**', 20);
    const roots = found
      .map((file) => vscode.Uri.joinPath(file, '..'))
      .sort((a, b) => a.path.localeCompare(b.path));
    if (roots.length === 0) return [{ kind: 'none' }];
    return Promise.all(
      roots.map(async (root): Promise<Node> => {
        const loaded = await loadProject(storageOf(root));
        return {
          kind: 'project',
          root,
          title: loaded.settings?.title ?? folderName(root),
          inOrder: loaded.settings !== undefined && loaded.stylesheet !== undefined,
          items: outlineOf(loaded),
        };
      }),
    );
  }
}

const isProjectFile = (fileName: string): boolean =>
  fileName.endsWith('.phrase.md') || fileName.endsWith('.yaml');

/** Shows the tree in the Explorer, keeps it up to date, and opens a document where it is clicked. */
export function registerPhraseTree(editors: PhraseEditorProvider): vscode.Disposable {
  const tree = new PhraseTree();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      tree.refresh();
    }, REFRESH_DELAY_MS);
  };
  const watchers = ['**/*.phrase.md', '**/*.yaml'].map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern),
  );
  const parts: vscode.Disposable[] = [
    tree,
    vscode.window.registerTreeDataProvider(OUTLINE_VIEW, tree),
    vscode.commands.registerCommand(OPEN_AT_COMMAND, (uri: vscode.Uri, block?: number) =>
      editors.open(uri, block),
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isProjectFile(event.document.fileName)) schedule();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(schedule),
    ...watchers.flatMap((watcher) => [
      watcher,
      watcher.onDidCreate(schedule),
      watcher.onDidChange(schedule),
      watcher.onDidDelete(schedule),
    ]),
  ];
  return {
    dispose: () => {
      clearTimeout(timer);
      for (const part of parts) part.dispose();
    },
  };
}
