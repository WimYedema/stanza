import * as vscode from 'vscode';
import { loadProject, DOCUMENT_SUFFIX } from '@stanza/project';
import { listHeadings } from './headings.js';
import { activeFile, findRoot, storageOf } from './project-files.js';

export const GO_TO_HEADING_COMMAND = 'stanza.goToHeading';

/** The title of a heading in the list, indented by its level and led by its number. */
const labelOf = (level: number, number: string | undefined, title: string): string =>
  `${'\u2003'.repeat(level - 1)}${number === undefined ? '' : `${number} `}${title}`;

/**
 * "Stanza: Go to Heading" lists the headings of the document in front, with their numbers, and
 * scrolls the editor to the one that is chosen.
 */
export function registerGoToHeading(
  reveal: (document: vscode.Uri, block: number) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand(GO_TO_HEADING_COMMAND, async () => {
    const file = activeFile();
    if (file === undefined || !file.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Stanza: open a Stanza document (.stanza.md) first.');
      return;
    }
    // The text as it is in the editor, saved or not.
    const text = (await vscode.workspace.openTextDocument(file)).getText();
    const root = await findRoot(file);
    const stylesheet =
      root === undefined ? undefined : (await loadProject(storageOf(root))).stylesheet;
    const headings = listHeadings(text.replace(/\r\n?/g, '\n'), stylesheet);
    if (headings.length === 0) {
      void vscode.window.showInformationMessage('Stanza: this document has no headings.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      headings.map((heading) => ({
        label: labelOf(heading.level, heading.number, heading.title),
        block: heading.block,
      })),
      { placeHolder: 'Go to heading', matchOnDescription: false },
    );
    if (picked !== undefined) reveal(file, picked.block);
  });
}
