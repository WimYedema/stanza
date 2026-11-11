import * as vscode from 'vscode';
import { addAgentInstructions, AGENT_INSTRUCTIONS_FILE } from '@phrase/project';
import { projectRoot, storageOf, uriInProject } from './project-files.js';

export const ADD_AGENT_INSTRUCTIONS_COMMAND = 'phrase.addAgentInstructions';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * "Phrase: Add Agent Instructions" writes `AGENTS.md` into the project of the document in front,
 * so that coding agents know the rules of the dialect (ADR 0061). It never replaces a file.
 */
export function registerAddAgentInstructions(): vscode.Disposable {
  return vscode.commands.registerCommand(ADD_AGENT_INSTRUCTIONS_COMMAND, async () => {
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Phrase: there is no project here. Open a folder that has a phrase.yaml file.',
      );
      return;
    }
    let result;
    try {
      result = await addAgentInstructions(storageOf(root));
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Phrase: ${AGENT_INSTRUCTIONS_FILE} could not be written. ${reasonOf(error)}`,
      );
      return;
    }
    if (!result.ok) {
      void vscode.window.showInformationMessage(
        `Phrase: the project has ${AGENT_INSTRUCTIONS_FILE} already. It was not changed.`,
      );
      return;
    }
    await vscode.commands.executeCommand('vscode.open', uriInProject(root, result.file));
  });
}
