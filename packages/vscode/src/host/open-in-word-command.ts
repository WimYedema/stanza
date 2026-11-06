import * as vscode from 'vscode';
import { DOCUMENT_SUFFIX } from '@phrase/project';
import type { ExportOnSave } from './export-on-save.js';
import { findRoot, activeFile } from './project-files.js';

export const OPEN_IN_WORD_COMMAND = 'phrase.openInWord';

/**
 * "Phrase: Open in Word" exports the document as it is open, saved or not, and opens its DOCX with
 * the program of the system. The title bar passes the document; the palette uses the editor in front.
 */
export function registerOpenInWord(exporter: ExportOnSave): vscode.Disposable {
  return vscode.commands.registerCommand(OPEN_IN_WORD_COMMAND, async (target?: vscode.Uri) => {
    // A remote or web window has no local program to start.
    if (vscode.env.remoteName !== undefined || vscode.env.uiKind !== vscode.UIKind.Desktop) {
      void vscode.window.showErrorMessage(
        'Phrase: Open in Word works in a local VS Code window only. Open the exported DOCX from the build folder yourself.',
      );
      return;
    }
    const document = target ?? activeFile();
    if (document === undefined || !document.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Phrase: open a Phrase document (.phrase.md) first.');
      return;
    }
    if ((await findRoot(document)) === undefined) {
      void vscode.window.showErrorMessage(
        'Phrase: this document is not in a project. Add a phrase.yaml file above it.',
      );
      return;
    }
    const written = await exporter.exportNow(document);
    if (written === undefined) return;
    if (!(await vscode.env.openExternal(written))) {
      void vscode.window.showErrorMessage(
        `Phrase: the DOCX was written but could not be opened: ${vscode.workspace.asRelativePath(written)}`,
      );
    }
  });
}
