import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { addDocument } from '@stanza/project';
import { projectRoot, uriInProject } from './project-files.js';
import { documentListStorage } from './document-list-commands.js';

export const NEW_DOCUMENT_COMMAND = 'stanza.newDocument';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** "Stanza: New Document" adds a document to a project and opens it (ADR 0044). */
export function registerNewDocument(): vscode.Disposable {
  return vscode.commands.registerCommand(NEW_DOCUMENT_COMMAND, async () => {
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: there is no project here. Open a folder that has a stanza.yaml file.',
      );
      return;
    }
    const title = await vscode.window.showInputBox({
      title: 'Stanza: New Document',
      prompt: 'The title of the document, from which its file name is made',
      validateInput: (value) => (value.trim() === '' ? 'A title is needed.' : undefined),
    });
    if (title === undefined) return;

    let result;
    try {
      result = await addDocument(await documentListStorage(root), {
        title,
        randomBytes: () => randomBytes(10),
      });
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Stanza: the document could not be written. ${reasonOf(error)}`,
      );
      return;
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(
        result.reason === 'exists'
          ? `Stanza: nothing was written, because ${result.existing} exists already. Choose another title.`
          : 'Stanza: a title is needed.',
      );
      return;
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uriInProject(root, result.document),
      'stanza.editor',
    );
  });
}
