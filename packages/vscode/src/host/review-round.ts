import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_BUILD_DATE,
  loadProject,
  newPushFileName,
  pullReview,
  pushFileName,
  pushReview,
  removedCommentsNote,
  reviewRoundStatus,
  type LoadedProject,
  type PushResult,
  type ReviewRoundStatus,
} from '@stanza/project';
import { documentListStorage } from './document-list-commands.js';
import { vscodeGitRevisions, vscodeGitSource } from './git-revisions.js';
import { findRoot, storageOf, uriInProject } from './project-files.js';

/**
 * The review round of a document from VS Code (ADR 0088): pushing it to its review folder, which is
 * remembered per document, pulling the comments from the file that was pushed there, and where the
 * round stands. Used by the commands and by the review buttons of the Stanza editor.
 */

const REPLACE = 'Replace Anyway';
const PUSH = 'Push';
const PUSH_ALWAYS = "Push, Don't Ask Again";
/** Set once the person said that a push may leave the comments of a file out without asking. */
const CLEAN_COPY_KNOWN = 'stanza.pushCleanCopyKnown';
const NEW_FILE = 'Write a New File';
const OPEN_REVIEW = 'Open Review';
const SHOW_OUTPUT = 'Show details';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The key under which the review folder of a document is remembered. */
const folderKey = (document: vscode.Uri): string => `stanza.pushFolder:${document.toString()}`;

/** The review folder remembered for a document, if any. */
export function rememberedFolder(
  state: vscode.Memento,
  document: vscode.Uri,
): vscode.Uri | undefined {
  const remembered = state.get<string>(folderKey(document));
  return remembered === undefined ? undefined : vscode.Uri.parse(remembered);
}

/** The file of a document in its review folder, as it is pushed there. */
export function pushedFile(state: vscode.Memento, document: vscode.Uri): vscode.Uri | undefined {
  const folder = rememberedFolder(state, document);
  return folder === undefined
    ? undefined
    : vscode.Uri.joinPath(folder, pushFileName(document.path));
}

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

async function chooseFolder(
  document: vscode.Uri,
  remembered: vscode.Uri | undefined,
): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Push Here',
    title: `Choose the review folder for ${pushFileName(document.path)}`,
    ...(remembered !== undefined ? { defaultUri: remembered } : {}),
  });
  return picked?.[0];
}

/**
 * How a push goes: to the remembered folder (asking for one when there is none), to a folder that
 * is chosen now, or as a new file beside the one in the remembered folder.
 */
export type PushMode = 'remembered' | 'choose' | 'new';

/**
 * Pushes a document to its review folder (ADR 0088). A file there is replaced, unless it was saved
 * in Word and not pulled, or is of another document: then the author chooses to replace it anyway
 * or to write a new file beside it. Returns whether a file was written.
 */
export async function pushDocument(
  state: vscode.Memento,
  document: vscode.Uri,
  mode: PushMode,
): Promise<boolean> {
  const root = await findRoot(document);
  if (root === undefined) {
    void vscode.window.showErrorMessage(
      'Stanza: this document is not in a project. Add a stanza.yaml file above it.',
    );
    return false;
  }
  const path = posix.relative(root.path, document.path);
  const remembered = rememberedFolder(state, document);
  const folder =
    mode === 'choose' || remembered === undefined
      ? await chooseFolder(document, remembered)
      : remembered;
  if (folder === undefined) return false;
  await state.update(folderKey(document), folder.toString());

  try {
    const storage = storageOf(root);
    const loaded = await loadProject(storage);
    const options = { timestamp: DEFAULT_BUILD_DATE, revisions: vscodeGitRevisions(root) };
    const newFile = async (): Promise<vscode.Uri> => {
      const names = new Set((await vscode.workspace.fs.readDirectory(folder)).map(([n]) => n));
      return vscode.Uri.joinPath(
        folder,
        newPushFileName(path, today(), (n) => names.has(n)),
      );
    };
    let file = mode === 'new' ? await newFile() : vscode.Uri.joinPath(folder, pushFileName(path));
    const existing = mode === 'new' ? undefined : await readIfThere(file);
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
      if (choice === undefined) return false;
      if (choice === NEW_FILE) {
        file = await newFile();
        replaces = false;
        result = await pushReview(storage, loaded, path, undefined, options);
      } else {
        result = await pushReview(storage, loaded, path, undefined, { ...options, force: true });
      }
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Stanza: not pushed. ${result.message} See Problems.`);
      return false;
    }
    // A push leaves the comments of the file it replaces out of the new one (ADR 0088), which
    // surprises when it is not said; once the person knows, they can say not to ask again.
    const note = replaces ? removedCommentsNote(name, result.removes) : undefined;
    if (note !== undefined && state.get<boolean>(CLEAN_COPY_KNOWN) !== true) {
      const choice = await vscode.window.showWarningMessage(
        `Stanza: ${note} Push anyway?`,
        { modal: true },
        PUSH,
        PUSH_ALWAYS,
        NEW_FILE,
      );
      if (choice === undefined) return false;
      if (choice === PUSH_ALWAYS) await state.update(CLEAN_COPY_KNOWN, true);
      if (choice === NEW_FILE) {
        file = await newFile();
        replaces = false;
      }
    }
    try {
      await vscode.workspace.fs.writeFile(file, result.bytes);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Stanza: ${vscode.workspace.asRelativePath(file)} was not written: ${reasonOf(error)} If it is open in Word, close it and push again.`,
      );
      return false;
    }
    void vscode.window.showInformationMessage(
      `Stanza: ${replaces ? 'replaced' : 'wrote'} ${vscode.workspace.asRelativePath(file)} for review.`,
    );
    return true;
  } catch (error) {
    void vscode.window.showErrorMessage(`Stanza: the push failed. ${reasonOf(error)}`);
    return false;
  }
}

/**
 * Pulls the comments of a reviewed DOCX into a new review document (ADR 0084). With `open`, the
 * review document is opened in the Stanza editor; otherwise the message offers to. Returns whether
 * a review document was written.
 */
export async function pullFile(
  root: vscode.Uri,
  file: vscode.Uri,
  log: vscode.OutputChannel,
  open: boolean,
): Promise<boolean> {
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
    return false;
  }
  if (!result.ok) {
    void vscode.window.showErrorMessage(`Stanza: no comments were pulled. ${result.message}`);
    return false;
  }
  log.appendLine(`Pulled ${fileName} into ${result.document}, the review of ${result.reviewed}.`);
  for (const line of result.lines) log.appendLine(`  ${line}`);
  for (const d of result.diagnostics) log.appendLine(`  ${d.severity}: ${d.code}: ${d.message}`);
  const review = uriInProject(root, result.document);
  if (open) await vscode.commands.executeCommand('vscode.openWith', review, 'stanza.editor');
  // The pull is over when the message shows; what is chosen on it comes later, if at all.
  void vscode.window
    .showInformationMessage(
      `Stanza: pulled the comments of ${fileName} into ${result.document}.`,
      ...(open ? [] : [OPEN_REVIEW]),
      SHOW_OUTPUT,
    )
    .then(async (choice) => {
      if (choice === SHOW_OUTPUT) log.show();
      if (choice === OPEN_REVIEW) {
        await vscode.commands.executeCommand('vscode.openWith', review, 'stanza.editor');
      }
    });
  return true;
}

/** Asks for a reviewed DOCX to pull. */
export async function chooseReviewedFile(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Pull Comments',
    title: 'Choose the reviewed Word document',
    filters: { 'Word documents': ['docx'] },
  });
  return picked?.[0];
}

/**
 * Pulls the comments of a document from the file that was pushed to its review folder, without a
 * dialog; when there is none, asks for the reviewed file. The review document is not opened, so
 * that the comments show beside the text of the document.
 */
export async function pullDocument(
  state: vscode.Memento,
  document: vscode.Uri,
  log: vscode.OutputChannel,
): Promise<boolean> {
  const root = await findRoot(document);
  if (root === undefined) return false;
  const pushed = pushedFile(state, document);
  const file =
    pushed !== undefined && (await readIfThere(pushed)) !== undefined
      ? pushed
      : await chooseReviewedFile();
  if (file === undefined) return false;
  return pullFile(root, file, log, false);
}

/** Where the review round of a document stands, by the file in its remembered review folder. */
export async function roundStatus(
  state: vscode.Memento,
  document: vscode.Uri,
  loaded: LoadedProject,
  path: string,
  source: string,
): Promise<ReviewRoundStatus> {
  const file = pushedFile(state, document);
  const bytes = file === undefined ? undefined : await readIfThere(file);
  return reviewRoundStatus(
    loaded,
    path,
    file === undefined || bytes === undefined
      ? undefined
      : { name: vscode.workspace.asRelativePath(file), bytes },
    source,
  );
}
