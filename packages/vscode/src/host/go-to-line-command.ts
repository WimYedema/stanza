import * as vscode from 'vscode';
import { blockStartLines } from '@stanza/format';
import { DOCUMENT_SUFFIX } from '@stanza/project';
import { blockAt, lineOf } from './lines.js';
import { activeFile } from './project-files.js';

export const GO_TO_LINE_COMMAND = 'stanza.goToLine';

/**
 * "Stanza: Go to Line" scrolls the editor to the block that holds a line of the Markdown text.
 * VS Code gives a custom editor no line when a file is opened from a link or from the Problems
 * panel (ADR 0063), so the line is typed or pasted here, as in `documents/a.stanza.md#L42`.
 */
export function registerGoToLine(
  reveal: (document: vscode.Uri, block: number) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand(GO_TO_LINE_COMMAND, async () => {
    const file = activeFile();
    if (file === undefined || !file.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Stanza: open a Stanza document (.stanza.md) first.');
      return;
    }
    const typed = await vscode.window.showInputBox({
      title: 'Stanza: Go to Line',
      prompt:
        'A line of the Markdown text, or a link that ends in one, such as notes.stanza.md#L42',
      validateInput: (value) =>
        lineOf(value) === undefined ? 'A line number, from 1, is needed.' : undefined,
    });
    const line = typed === undefined ? undefined : lineOf(typed);
    if (line === undefined) return;
    // The text as it is in the editor, saved or not.
    const text = (await vscode.workspace.openTextDocument(file)).getText();
    const block = blockAt(blockStartLines(text), line);
    if (block === undefined) {
      void vscode.window.showInformationMessage('Stanza: this document has no blocks.');
      return;
    }
    reveal(file, block);
  });
}
