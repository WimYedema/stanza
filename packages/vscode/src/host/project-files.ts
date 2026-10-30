import * as vscode from 'vscode';
import type { DirectoryEntry, ProjectStorage } from '@phrase/project';
import { PROJECT_FILE } from '@phrase/project';
import { findProjectRoot } from './project-root.js';
import { normalized } from './review.js';
import { projectStorage } from './storage.js';

/** The folder of the project of a document, if there is one inside its workspace folder. */
export async function findRoot(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  const top = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.Uri.joinPath(uri, '..');
  const exists = async (folder: vscode.Uri): Promise<boolean> => {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder, PROJECT_FILE));
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

/** The URI of a path in a project. */
export const uriInProject = (root: vscode.Uri, path: string): vscode.Uri =>
  path === '' ? root : vscode.Uri.joinPath(root, ...path.split('/'));

/** The storage of a project on VS Code's file system, which reads open documents as they are. */
export function storageOf(root: vscode.Uri): ProjectStorage {
  return projectStorage({
    read: (path) => Promise.resolve(vscode.workspace.fs.readFile(uriInProject(root, path))),
    async list(directory): Promise<readonly DirectoryEntry[]> {
      const entries = await vscode.workspace.fs.readDirectory(uriInProject(root, directory));
      // Links and special files are left out, as in the command line.
      return entries.flatMap(([name, type]) =>
        type === vscode.FileType.Directory || type === vscode.FileType.File
          ? [{ name, directory: type === vscode.FileType.Directory }]
          : [],
      );
    },
    write: (path, content) =>
      Promise.resolve(vscode.workspace.fs.writeFile(uriInProject(root, path), content)),
    openText(path) {
      const wanted = uriInProject(root, path).toString();
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === wanted);
      return open === undefined ? undefined : normalized(open.getText());
    },
  });
}
