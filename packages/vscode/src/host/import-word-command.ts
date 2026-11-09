import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { describeImport, importWordDocument } from '@phrase/project';
import { projectRoot, storageOf, uriInProject } from './project-files.js';

export const IMPORT_WORD_COMMAND = 'phrase.importWord';

const SHOW_REPORT = 'Show report';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The name of a file without its folder and its extension. */
const nameOf = (uri: vscode.Uri): string => {
  const file = uri.path.slice(uri.path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
};

/**
 * "Phrase: Import Word Document" adds the content of a DOCX to a project as a new document and
 * opens it. What could not be carried over is written to the Phrase output (ADR 0047).
 */
export function registerImportWord(log: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand(IMPORT_WORD_COMMAND, async () => {
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Phrase: there is no project here. Open a folder that has a phrase.yaml file.',
      );
      return;
    }
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Import',
      title: 'Choose the Word document to import',
      filters: { 'Word documents': ['docx'] },
    });
    const file = picked?.[0];
    if (file === undefined) return;

    let result;
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      result = await importWordDocument(storageOf(root), bytes, {
        name: nameOf(file),
        randomBytes: () => randomBytes(10),
      });
    } catch (error) {
      void vscode.window.showErrorMessage(`Phrase: the import failed. ${reasonOf(error)}`);
      return;
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Phrase: nothing was imported. ${result.message}`);
      return;
    }

    log.appendLine(`Imported ${nameOf(file)}.docx as ${result.document}.`);
    for (const line of describeImport(result.report)) log.appendLine(`  ${line}`);
    for (const d of result.diagnostics) log.appendLine(`  ${d.severity}: ${d.code}: ${d.message}`);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uriInProject(root, result.document),
      'phrase.editor',
    );
    const notes = result.report.diagnostics.length;
    const choice = await vscode.window.showInformationMessage(
      `Phrase: imported ${result.document}. The report has ${String(notes)} ${notes === 1 ? 'entry' : 'entries'}.`,
      SHOW_REPORT,
    );
    if (choice === SHOW_REPORT) log.show();
  });
}
