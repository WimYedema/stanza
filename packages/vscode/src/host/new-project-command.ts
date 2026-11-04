import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { createProject } from '@phrase/project';
import { uriInProject, storageOf } from './project-files.js';

export const NEW_PROJECT_COMMAND = 'phrase.newProject';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** "Phrase: New Project" writes a project into a folder that is picked, and opens its first document (ADR 0042). */
export function registerNewProject(): vscode.Disposable {
  return vscode.commands.registerCommand(NEW_PROJECT_COMMAND, async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Create the project here',
      title: 'Choose a folder for the new project',
      ...(vscode.workspace.workspaceFolders?.[0] !== undefined
        ? { defaultUri: vscode.workspace.workspaceFolders[0].uri }
        : {}),
    });
    const folder = picked?.[0];
    if (folder === undefined) return;

    const title = await vscode.window.showInputBox({
      title: 'Phrase: New Project',
      prompt: 'The title of the project, which is also the title of its first document',
      value: folder.path.split('/').filter(Boolean).pop() ?? '',
      validateInput: (value) => (value.trim() === '' ? 'A title is needed.' : undefined),
    });
    if (title === undefined) return;

    let result;
    try {
      result = await createProject(storageOf(folder), {
        title,
        randomBytes: () => randomBytes(10),
      });
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Phrase: the project could not be written. ${reasonOf(error)}`,
      );
      return;
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(
        result.reason === 'exists'
          ? `Phrase: nothing was written, because the folder has ${result.existing.join(', ')} already.`
          : 'Phrase: a title is needed.',
      );
      return;
    }

    if (vscode.workspace.getWorkspaceFolder(folder) !== undefined) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uriInProject(folder, result.document),
        'phrase.editor',
      );
      return;
    }
    // Without a workspace folder the project of a document is not found, so the folder is opened.
    const choice = await vscode.window.showInformationMessage(
      `Phrase: the project is written. Open its folder, then the file ${result.document}.`,
      'Open folder',
    );
    if (choice === 'Open folder') await vscode.commands.executeCommand('vscode.openFolder', folder);
  });
}
