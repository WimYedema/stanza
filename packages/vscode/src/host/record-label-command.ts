import * as vscode from 'vscode';
import {
  PROJECT_FILE,
  recordSensitivityLabelFromFile,
  type RecordLabelOptions,
} from '@stanza/project';
import { documentListStorage } from './document-list-commands.js';
import { projectRoot, uriInProject } from './project-files.js';

export const RECORD_LABEL_COMMAND = 'stanza.recordSensitivityLabel';

const REPLACE = 'Replace';
const SAVE = 'Save project file';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * "Stanza: Record Sensitivity Label" asks for a DOCX that Word labelled in the tenant and records
 * its label in the project file for the classification of its document (ADR 0087), as an undoable
 * edit of the project file's buffer (ADR 0079). Without a classification it asks for one; for a
 * classification with another label it asks before replacing it.
 */
export function registerRecordLabel(): vscode.Disposable {
  return vscode.commands.registerCommand(RECORD_LABEL_COMMAND, async () => {
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
      openLabel: 'Record Label',
      title: 'Choose a Word document that has the sensitivity label',
      filters: { 'Word documents': ['docx'] },
    });
    const file = picked?.[0];
    if (file === undefined) return;

    let options: RecordLabelOptions = {};
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      // At most twice more: once for the classification, once to replace another label.
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await recordSensitivityLabelFromFile(
          await documentListStorage(root, false),
          bytes,
          options,
        );
        if (result.ok) {
          const name = result.label.name ?? `label ${result.label.id}`;
          if (!result.changed) {
            void vscode.window.showInformationMessage(
              `Stanza: ${name} is already recorded for "${result.classification}".`,
            );
            return;
          }
          const choice = await vscode.window.showInformationMessage(
            `Stanza: recorded ${name} for the classification "${result.classification}" in stanza.yaml. Save the project file to keep this change.`,
            SAVE,
          );
          if (choice === SAVE) {
            const project = await vscode.workspace.openTextDocument(
              uriInProject(root, PROJECT_FILE),
            );
            if (!(await project.save())) {
              void vscode.window.showErrorMessage('Stanza: stanza.yaml could not be saved.');
            }
          }
          return;
        }
        if (result.reason === 'no-classification' && options.classification === undefined) {
          const classification = await vscode.window.showInputBox({
            title: 'Record Sensitivity Label',
            prompt: `${result.message.replace(/ Give .*$/, '')} Which classification is the label for?`,
            placeHolder: 'Confidential',
            validateInput: (value) =>
              value.trim() === '' ? 'Give the classification, as documents write it.' : undefined,
          });
          if (classification === undefined) return;
          options = { ...options, classification: classification.trim() };
          continue;
        }
        if (result.reason === 'differs' && options.replace !== true) {
          const choice = await vscode.window.showWarningMessage(
            `Stanza: ${result.message.replace(/ Give --replace.*$/, '')} Replace it?`,
            { modal: true },
            REPLACE,
          );
          if (choice !== REPLACE) return;
          options = { ...options, replace: true };
          continue;
        }
        void vscode.window.showErrorMessage(`Stanza: no label was recorded. ${result.message}`);
        return;
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Stanza: the label was not recorded. ${reasonOf(error)}`);
    }
  });
}
