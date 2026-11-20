import * as vscode from 'vscode';
import { DOCUMENT_SUFFIX } from '@stanza/project';
import { activeFile } from './project-files.js';

export const MAKE_REFERENCE_COMMAND = 'stanza.makeReference';

/**
 * "Stanza: Make Reference" opens the list of headings in the editor that is in front, for the
 * selected text (ADR 0069). It is also in the context menu of the editor, where the webview has
 * no menu of its own, and the list itself is drawn by the webview, which holds the selection.
 */
export function registerMakeReference(request: (document: vscode.Uri) => void): vscode.Disposable {
  return vscode.commands.registerCommand(MAKE_REFERENCE_COMMAND, () => {
    const file = activeFile();
    if (file === undefined || !file.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Stanza: open a Stanza document (.stanza.md) first.');
      return;
    }
    request(file);
  });
}
