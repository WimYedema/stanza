import * as vscode from 'vscode';
import { DOCUMENT_SUFFIX } from '@phrase/project';
import { activeFile } from './project-files.js';

export const MAKE_REFERENCE_COMMAND = 'phrase.makeReference';

/**
 * "Phrase: Make Reference" opens the list of headings in the editor that is in front, for the
 * selected text (ADR 0069). It is also in the context menu of the editor, where the webview has
 * no menu of its own, and the list itself is drawn by the webview, which holds the selection.
 */
export function registerMakeReference(request: (document: vscode.Uri) => void): vscode.Disposable {
  return vscode.commands.registerCommand(MAKE_REFERENCE_COMMAND, () => {
    const file = activeFile();
    if (file === undefined || !file.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Phrase: open a Phrase document (.phrase.md) first.');
      return;
    }
    request(file);
  });
}
