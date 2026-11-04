import * as vscode from 'vscode';
import { StylesEditorProvider } from './styles-provider.js';
import { locateStylesheet } from './styles-project.js';

export const EDIT_STYLES_COMMAND = 'phrase.editStyles';

/** The file of the editor that is in front, whether it is a text or a custom editor. */
function activeFile(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom
    ? input.uri
    : undefined;
}

/** The project file to start from when no file is in front: the only one, or the one that is picked. */
async function pickedProjectFile(): Promise<vscode.Uri | undefined> {
  const found = await vscode.workspace.findFiles('**/phrase.yaml', '**/node_modules/**', 20);
  if (found.length <= 1) return found[0];
  const picked = await vscode.window.showQuickPick(
    found.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
    { placeHolder: 'Which project?' },
  );
  return picked?.uri;
}

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
