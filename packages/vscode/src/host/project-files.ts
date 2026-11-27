import { readdir, readFile, stat } from 'node:fs/promises';
import * as vscode from 'vscode';
import type { DirectoryEntry, ProjectStorage } from '@stanza/project';
import { PROJECT_FILE } from '@stanza/project';
import { findProjectRoot } from './project-root.js';
import { normalized } from './review.js';
import { projectStorage } from './storage.js';

/** The folder of the project of a document, if there is one inside its workspace folder. */
export async function findRoot(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  const top = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.Uri.joinPath(uri, '..');
  const exists = async (folder: vscode.Uri): Promise<boolean> => {
    const file = vscode.Uri.joinPath(folder, PROJECT_FILE);
    try {
      if (onDisk(file)) await stat(file.fsPath);
      else await vscode.workspace.fs.stat(file);
      return true;
    } catch {
      return false;
    }
  };
  return findProjectRoot(
    vscode.Uri.joinPath(uri, '..'),
    (folder) => {
      const above = vscode.Uri.joinPath(folder, '..');
      return above.toString() === folder.toString() ? undefined : above;
    },
    exists,
    (folder) => folder.toString() === top.toString(),
  );
}

/** The file of the editor that is in front, whether it is a text or a custom editor. */
export function activeFile(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom
    ? input.uri
    : undefined;
}

/** The project file to start from when no file is in front: the only one, or the one that is picked. */
export async function pickedProjectFile(): Promise<vscode.Uri | undefined> {
  const found = await vscode.workspace.findFiles('**/stanza.yaml', '**/node_modules/**', 20);
  if (found.length <= 1) return found[0];
  const picked = await vscode.window.showQuickPick(
    found.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
    { placeHolder: 'Which project?' },
  );
  return picked?.uri;
}

/** The project of the file in front, or the one that is picked when that file is in none. */
export async function projectRoot(): Promise<vscode.Uri | undefined> {
  const from = activeFile();
  const near = from === undefined ? undefined : await findRoot(from);
  if (near !== undefined) return near;
  const picked = await pickedProjectFile();
  return picked === undefined ? undefined : findRoot(picked);
}

/** The URI of a path in a project. */
export const uriInProject = (root: vscode.Uri, path: string): vscode.Uri =>
  path === '' ? root : vscode.Uri.joinPath(root, ...path.split('/'));

/**
 * A file on the local disk, which the extension host reads with Node itself (architecture section
 * 11): each call of `vscode.workspace.fs` goes to another process of VS Code, which made reading a
 * project several times slower (ADR 0101, item 238). Other schemes, such as a remote or virtual
 * workspace, go through VS Code.
 */
const onDisk = (uri: vscode.Uri): boolean => uri.scheme === 'file';

/** The storage of a project on VS Code's file system, which reads open documents as they are. */
export function storageOf(root: vscode.Uri): ProjectStorage {
  return projectStorage({
    read: async (path) => {
      const uri = uriInProject(root, path);
      return onDisk(uri) ? readFile(uri.fsPath) : vscode.workspace.fs.readFile(uri);
    },
    async list(directory): Promise<readonly DirectoryEntry[]> {
      const uri = uriInProject(root, directory);
      if (onDisk(uri)) {
        // Links and special files are left out, as in the command line.
        const entries = await readdir(uri.fsPath, { withFileTypes: true });
        return entries.flatMap((entry) =>
          entry.isDirectory() || entry.isFile()
            ? [{ name: entry.name, directory: entry.isDirectory() }]
            : [],
        );
      }
      const entries = await vscode.workspace.fs.readDirectory(uri);
      // Links and special files are left out, as in the command line.
      return entries.flatMap(([name, type]) =>
        type === vscode.FileType.Directory || type === vscode.FileType.File
          ? [{ name, directory: type === vscode.FileType.Directory }]
          : [],
      );
    },
    write: async (path, content) => {
      const slash = path.lastIndexOf('/');
      // The output directory may not exist yet, and folders of any depth are made as needed.
      if (slash > 0) {
        await vscode.workspace.fs.createDirectory(uriInProject(root, path.slice(0, slash)));
      }
      await vscode.workspace.fs.writeFile(uriInProject(root, path), content);
    },
    openText(path) {
      const wanted = uriInProject(root, path).toString();
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === wanted);
      return open === undefined ? undefined : normalized(open.getText());
    },
  });
}
