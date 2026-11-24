import * as vscode from 'vscode';
import { DOCUMENT_SUFFIX } from '@stanza/project';
import { projectRoot } from './project-files.js';
import { chooseReviewedFile, pullDocument, pullFile } from './review-round.js';

export const PULL_REVIEW_COMMAND = 'stanza.pullReview';

/**
 * "Stanza: Pull Review Comments" writes the comments of a reviewed DOCX into a new review document
 * in `reviews/` (ADR 0084). From the palette it asks for the file and opens the review document in
 * the Stanza editor. On a document, as the title bar of the editor gives it, it pulls from the file
 * that was pushed to the review folder of that document (ADR 0088), and stays in the document,
 * where the comments show beside their text. Nothing in the file is applied to the source.
 */
export function registerPullReview(
  log: vscode.OutputChannel,
  state: vscode.Memento,
): vscode.Disposable {
  return vscode.commands.registerCommand(PULL_REVIEW_COMMAND, async (target?: unknown) => {
    if (target instanceof vscode.Uri && target.path.endsWith(DOCUMENT_SUFFIX)) {
      await pullDocument(state, target, log);
      return;
    }
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: there is no project here. Open a folder that has a stanza.yaml file.',
      );
      return;
    }
    const file = await chooseReviewedFile();
    if (file === undefined) return;
    await pullFile(root, file, log, true);
  });
}
