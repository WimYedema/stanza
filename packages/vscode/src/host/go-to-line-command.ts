import * as vscode from 'vscode';
import { blockStartLines } from '@phrase/format';
import { DOCUMENT_SUFFIX } from '@phrase/project';
import { blockAt, lineOf } from './lines.js';
import { activeFile } from './project-files.js';

export const GO_TO_LINE_COMMAND = 'phrase.goToLine';

/**
 * "Phrase: Go to Line" scrolls the editor to the block that holds a line of the Markdown text.
 * VS Code gives a custom editor no line when a file is opened from a link or from the Problems
 * panel (ADR 0063), so the line is typed or pasted here, as in `documents/a.phrase.md#L42`.
 */
export function registerGoToLine(
  reveal: (document: vscode.Uri, block: number) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand(GO_TO_LINE_COMMAND, async () => {
    const file = activeFile();
    if (file === undefined || !file.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Phrase: open a Phrase document (.phrase.md) first.');
      return;
    }
    const typed = await vscode.window.showInputBox({
      title: 'Phrase: Go to Line',
      prompt:
        'A line of the Markdown text, or a link that ends in one, such as notes.phrase.md#L42',
      validateInput: (value) =>
        lineOf(value) === undefined ? 'A line number, from 1, is needed.' : undefined,
    });
    const line = typed === undefined ? undefined : lineOf(typed);
    if (line === undefined) return;
    // The text as it is in the editor, saved or not.
    const text = (await vscode.workspace.openTextDocument(file)).getText();
    const block = blockAt(blockStartLines(text), line);
    if (block === undefined) {
      void vscode.window.showInformationMessage('Phrase: this document has no blocks.');
      return;
    }
    reveal(file, block);
  });
}
