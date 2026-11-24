import { posix } from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_BUILD_DATE,
  DOCUMENT_SUFFIX,
  loadProject,
  newPushFileName,
  pushFileName,
  pushReview,
  type PushResult,
} from '@stanza/project';
import { vscodeGitRevisions } from './git-revisions.js';
import { activeFile, findRoot, storageOf } from './project-files.js';

export const PUSH_REVIEW_COMMAND = 'stanza.pushReview';

const REPLACE = 'Replace Anyway';
const NEW_FILE = 'Write a New File';

/** The key under which the review folder of a document is remembered. */
const folderKey = (document: vscode.Uri): string => `stanza.pushFolder:${document.toString()}`;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The day of the clock, for the name of a new file. */
const today = (): string => {
  const now = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
};

async function readIfThere(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  try {
    return await vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
}

/**
 * "Stanza: Push for Review" builds the document of the editor and writes it to its review folder
 * (ADR 0088), which is asked for and remembered per document. A file there is replaced, unless it
 * was saved in Word and not pulled, or is of another document: then the author chooses to replace
 * it anyway or to write a new file beside it.
 */
export function registerPushReview(state: vscode.Memento): vscode.Disposable {
  return vscode.commands.registerCommand(PUSH_REVIEW_COMMAND, async (target?: vscode.Uri) => {
    const document = target ?? activeFile();
    if (document === undefined || !document.path.endsWith(DOCUMENT_SUFFIX)) {
      void vscode.window.showErrorMessage('Stanza: open a Stanza document (.stanza.md) first.');
      return;
    }
    const root = await findRoot(document);
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: this document is not in a project. Add a stanza.yaml file above it.',
      );
      return;
    }
    const path = posix.relative(root.path, document.path);
    const remembered = state.get<string>(folderKey(document));
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Push Here',
      title: `Choose the review folder for ${pushFileName(path)}`,
      ...(remembered !== undefined ? { defaultUri: vscode.Uri.parse(remembered) } : {}),
    });
    const folder = picked?.[0];
    if (folder === undefined) return;
    await state.update(folderKey(document), folder.toString());

    try {
      const storage = storageOf(root);
      const loaded = await loadProject(storage);
      const options = { timestamp: DEFAULT_BUILD_DATE, revisions: vscodeGitRevisions(root) };
      let file = vscode.Uri.joinPath(folder, pushFileName(path));
      const existing = await readIfThere(file);
      const name = vscode.workspace.asRelativePath(file);
      let replaces = existing !== undefined;
      let result: PushResult = await pushReview(
        storage,
        loaded,
        path,
        existing === undefined ? undefined : { name, bytes: existing },
        options,
      );
      if (!result.ok && result.reason !== 'blocked' && result.reason !== 'errors') {
        const choice = await vscode.window.showWarningMessage(
          `Stanza: ${result.message.replace(/, or push with --force to replace it\.$/, '.')}`,
          { modal: true },
          REPLACE,
          NEW_FILE,
        );
        if (choice === undefined) return;
        if (choice === NEW_FILE) {
          const names = new Set((await vscode.workspace.fs.readDirectory(folder)).map(([n]) => n));
          file = vscode.Uri.joinPath(
            folder,
            newPushFileName(path, today(), (n) => names.has(n)),
          );
          replaces = false;
          result = await pushReview(storage, loaded, path, undefined, options);
        } else {
          result = await pushReview(storage, loaded, path, undefined, { ...options, force: true });
        }
      }
      if (!result.ok) {
        void vscode.window.showErrorMessage(`Stanza: not pushed. ${result.message} See Problems.`);
        return;
      }
      try {
        await vscode.workspace.fs.writeFile(file, result.bytes);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `Stanza: ${vscode.workspace.asRelativePath(file)} was not written: ${reasonOf(error)} If it is open in Word, close it and push again.`,
        );
        return;
      }
      void vscode.window.showInformationMessage(
        `Stanza: ${replaces ? 'replaced' : 'wrote'} ${vscode.workspace.asRelativePath(file)} for review.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`Stanza: the push failed. ${reasonOf(error)}`);
    }
  });
}
