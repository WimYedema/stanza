import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { addDocument } from '@phrase/project';
import {
  activeFile,
  findRoot,
  pickedProjectFile,
  storageOf,
  uriInProject,
} from './project-files.js';

export const NEW_DOCUMENT_COMMAND = 'phrase.newDocument';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The project of the file in front, or the one that is picked when that file is in none. */
async function projectRoot(): Promise<vscode.Uri | undefined> {
  const from = activeFile();
  const near = from === undefined ? undefined : await findRoot(from);
  if (near !== undefined) return near;
  const picked = await pickedProjectFile();
  return picked === undefined ? undefined : findRoot(picked);
}

/** "Phrase: New Document" adds a document to a project and opens it (ADR 0044). */
export function registerNewDocument(): vscode.Disposable {
  return vscode.commands.registerCommand(NEW_DOCUMENT_COMMAND, async () => {
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Phrase: there is no project here. Open a folder that has a phrase.yaml file.',
      );
      return;
    }
    const title = await vscode.window.showInputBox({
      title: 'Phrase: New Document',
      prompt: 'The title of the document, from which its file name is made',
      validateInput: (value) => (value.trim() === '' ? 'A title is needed.' : undefined),
    });
    if (title === undefined) return;

    let result;
    try {
      result = await addDocument(storageOf(root), { title, randomBytes: () => randomBytes(10) });
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Phrase: the document could not be written. ${reasonOf(error)}`,
      );
      return;
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(
        result.reason === 'exists'
          ? `Phrase: nothing was written, because ${result.existing} exists already. Choose another title.`
          : 'Phrase: a title is needed.',
      );
      return;
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uriInProject(root, result.document),
      'phrase.editor',
    );
  });
}
