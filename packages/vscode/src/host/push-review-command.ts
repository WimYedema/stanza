import * as vscode from 'vscode';
import { DOCUMENT_SUFFIX } from '@stanza/project';
import { activeFile } from './project-files.js';
import { pushDocument } from './review-round.js';

export const PUSH_REVIEW_COMMAND = 'stanza.pushReview';

/**
 * "Stanza: Push for Review" builds the document of the editor and writes it to its review folder
 * (ADR 0088). The folder is asked for, with the remembered one first, and remembered per document.
 * The review buttons of the editor push to the remembered folder without asking.
 */
export function registerPushReview(state: vscode.Memento): vscode.Disposable {
  return vscode.commands.registerCommand(PUSH_REVIEW_COMMAND, async (target?: vscode.Uri) => {
    const document = target ?? activeFile();
    if (document === undefined || !document.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Stanza: open a Stanza document (.stanza.md) first.');
      return;
    }
    await pushDocument(state, document, 'choose');
  });
}
