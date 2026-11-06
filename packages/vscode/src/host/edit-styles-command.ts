import * as vscode from 'vscode';
import { activeFile, pickedProjectFile } from './project-files.js';
import { StylesEditorProvider } from './styles-provider.js';
import { locateStylesheet } from './styles-project.js';

export const EDIT_STYLES_COMMAND = 'phrase.editStyles';

/** "Phrase: Edit Styles" opens the stylesheet of the project of the file in front (ADR 0036). */
export function registerEditStyles(): vscode.Disposable {
  return vscode.commands.registerCommand(EDIT_STYLES_COMMAND, async () => {
    const from = activeFile() ?? (await pickedProjectFile());
    if (from === undefined) {
      void vscode.window.showErrorMessage(
        'Phrase: there is no project here. Open a folder that has a phrase.yaml file.',
      );
      return;
    }
    const found = await locateStylesheet(from);
    if (!found.ok) {
      void vscode.window.showErrorMessage(
        `Phrase: ${found.title}. ${found.reasons.map((reason) => reason.message).join(' ')}`,
      );
      return;
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      found.uri,
      StylesEditorProvider.viewType,
    );
  });
}
