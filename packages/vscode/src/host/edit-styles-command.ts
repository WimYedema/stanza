import * as vscode from 'vscode';
import { activeFile, pickedProjectFile } from './project-files.js';
import {
  StylesEditorProvider,
  requestStyleSelection,
  type StyleSelection,
} from './styles-provider.js';
import { locateStylesheet } from './styles-project.js';

export const EDIT_STYLES_COMMAND = 'stanza.editStyles';

const KINDS: readonly unknown[] = ['paragraph-style', 'character-style', 'table-style'];

/** The style to select, from the argument of the command, or nothing for anything else. */
function selectionOf(value: unknown): StyleSelection | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { kind, name } = value as { kind?: unknown; name?: unknown };
  if (!KINDS.includes(kind) || typeof name !== 'string' || name === '') return undefined;
  return { kind, name } as StyleSelection;
}

/**
 * "Stanza: Edit Styles" opens the stylesheet of the project of the file in front (ADR 0036). Given
 * a style, as the document editor does, it selects it (ADR 0054).
 */
export function registerEditStyles(): vscode.Disposable {
  return vscode.commands.registerCommand(EDIT_STYLES_COMMAND, async (style?: unknown) => {
    const from = activeFile() ?? (await pickedProjectFile());
    if (from === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: there is no project here. Open a folder that has a stanza.yaml file.',
      );
      return;
    }
    const found = await locateStylesheet(from);
    if (!found.ok) {
      void vscode.window.showErrorMessage(
        `Stanza: ${found.title}. ${found.reasons.map((reason) => reason.message).join(' ')}`,
      );
      return;
    }
    const selection = selectionOf(style);
    if (selection !== undefined) requestStyleSelection(found.uri, selection);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      found.uri,
      StylesEditorProvider.viewType,
    );
  });
}
