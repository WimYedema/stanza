import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { pullReview } from '@stanza/project';
import { documentListStorage } from './document-list-commands.js';
import { vscodeGitSource } from './git-revisions.js';
import { projectRoot, uriInProject } from './project-files.js';

export const PULL_REVIEW_COMMAND = 'stanza.pullReview';

const SHOW_OUTPUT = 'Show details';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * "Stanza: Pull Review Comments" asks for a reviewed DOCX, writes its comments into a new review
 * document in `reviews/`, and opens it in the Stanza editor (ADR 0084). What the pull found goes to
 * the Stanza output. Nothing in the file is applied to the source.
 */
export function registerPullReview(log: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand(PULL_REVIEW_COMMAND, async () => {
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: there is no project here. Open a folder that has a stanza.yaml file.',
      );
      return;
    }
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Pull Comments',
      title: 'Choose the reviewed Word document',
      filters: { 'Word documents': ['docx'] },
    });
    const file = picked?.[0];
    if (file === undefined) return;
    const fileName = file.path.slice(file.path.lastIndexOf('/') + 1);

    let result;
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      result = await pullReview(await documentListStorage(root), bytes, {
        fileName,
        randomBytes: () => randomBytes(10),
        sourceAt: vscodeGitSource(root),
      });
    } catch (error) {
      void vscode.window.showErrorMessage(`Stanza: the pull failed. ${reasonOf(error)}`);
      return;
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Stanza: no comments were pulled. ${result.message}`);
      return;
    }

    log.appendLine(`Pulled ${fileName} into ${result.document}, the review of ${result.reviewed}.`);
    for (const line of result.lines) log.appendLine(`  ${line}`);
    for (const d of result.diagnostics) log.appendLine(`  ${d.severity}: ${d.code}: ${d.message}`);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uriInProject(root, result.document),
      'stanza.editor',
    );
    const choice = await vscode.window.showInformationMessage(
      `Stanza: pulled the comments of ${fileName} into ${result.document}.`,
      SHOW_OUTPUT,
    );
    if (choice === SHOW_OUTPUT) log.show();
  });
}
