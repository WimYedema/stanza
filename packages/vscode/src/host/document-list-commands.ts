import * as vscode from 'vscode';
import type { OutlineEntry } from '@phrase/core';
import { editDocumentList, parseProject, type DocumentListChange } from '@phrase/format';
import { initializeDocumentList, PROJECT_FILE, type ProjectStorage } from '@phrase/project';
import { replaceText } from './declare-variant.js';
import { findRoot, projectRoot, storageOf, uriInProject } from './project-files.js';
import type { ProjectDiagnostics } from './project-diagnostics.js';
import { normalized } from './review.js';

export const INITIALIZE_DOCUMENT_LIST_COMMAND = 'phrase.initializeDocumentList';
export const MOVE_DOCUMENT_UP_COMMAND = 'phrase.moveDocumentUp';
export const MOVE_DOCUMENT_DOWN_COMMAND = 'phrase.moveDocumentDown';
export const REGROUP_DOCUMENT_COMMAND = 'phrase.regroupDocument';
export const FIX_DOCUMENT_LIST_COMMAND = 'phrase.fixDocumentList';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function offerSave(document: vscode.TextDocument): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Phrase: document list updated in phrase.yaml. Save the project file to keep this change.',
    'Save project file',
  );
  if (choice === 'Save project file' && !(await document.save())) {
    throw new Error('phrase.yaml was edited but could not be saved.');
  }
}

/**
 * Project-file changes are undoable buffer edits, as for stylesheet quick fixes. Other writes
 * (new/imported/adopted documents) still use the filesystem.
 */
export async function documentListStorage(root: vscode.Uri): Promise<ProjectStorage> {
  const storage = storageOf(root);
  const document = await vscode.workspace.openTextDocument(uriInProject(root, PROJECT_FILE));
  let seen = normalized(document.getText());
  return {
    ...storage,
    readText: (path) => {
      if (path !== PROJECT_FILE) return storage.readText(path);
      seen = normalized(document.getText());
      return Promise.resolve(seen);
    },
    writeText: async (path, text) => {
      if (path !== PROJECT_FILE) return storage.writeText(path, text);
      const before = normalized(document.getText());
      if (before !== seen) throw new Error('phrase.yaml changed. Request the edit again.');
      if (!(await replaceText(document, before, text))) {
        throw new Error('The document-list edit was not applied.');
      }
      void offerSave(document).catch((error: unknown) => {
        void vscode.window.showErrorMessage(
          `Phrase: the project file is unsaved. ${reasonOf(error)}`,
        );
      });
    },
  };
}

interface DocumentTarget {
  readonly root: vscode.Uri;
  readonly path: string;
}

function documentTarget(value: unknown): DocumentTarget | undefined {
  if (typeof value !== 'object' || value === null || !('root' in value)) return undefined;
  if (!(value.root instanceof vscode.Uri) || !('document' in value)) return undefined;
  const document = value.document;
  if (
    typeof document !== 'object' ||
    document === null ||
    !('path' in document) ||
    typeof document.path !== 'string'
  ) {
    return undefined;
  }
  return { root: value.root, path: document.path };
}

interface GroupChoice extends vscode.QuickPickItem {
  readonly trail: readonly number[];
}

function groupChoices(entries: readonly OutlineEntry[]): GroupChoice[] {
  const choices: GroupChoice[] = [{ label: 'Project root', trail: [] }];
  const add = (items: readonly OutlineEntry[], trail: readonly number[], parents: string[]) => {
    for (const [index, item] of items.entries()) {
      if (item.kind !== 'group') continue;
      const path = [...parents, item.title];
      const at = [...trail, index];
      choices.push({ label: path.join(' / '), description: at.join('.'), trail: at });
      add(item.items, at, path);
    }
  };
  add(entries, [], []);
  return choices;
}

async function changeList(
  root: vscode.Uri,
  change: Exclude<DocumentListChange, { kind: 'initialize' }>,
  diagnostics: ProjectDiagnostics,
  expected?: string,
): Promise<void> {
  const storage = await documentListStorage(root);
  const before = await storage.readText(PROJECT_FILE);
  if (expected !== undefined && before !== expected) {
    throw new Error('phrase.yaml changed. Choose the destination group again.');
  }
  const edit = editDocumentList(before, change);
  if (!edit.ok) throw new Error(edit.message);
  if ((await storage.readText(PROJECT_FILE)) !== before) {
    throw new Error('phrase.yaml changed. Request the edit again.');
  }
  await storage.writeText(PROJECT_FILE, edit.text);
  await diagnostics.refresh(root);
}

export function registerDocumentListCommands(diagnostics: ProjectDiagnostics): vscode.Disposable[] {
  const move = (direction: 'up' | 'down') => async (value: unknown) => {
    try {
      const target = documentTarget(value);
      if (target === undefined) throw new Error('Choose a document in the Phrase view.');
      await changeList(target.root, { kind: 'move', path: target.path, direction }, diagnostics);
    } catch (error) {
      await vscode.window.showErrorMessage(`Phrase: ${reasonOf(error)}`);
    }
  };
  return [
    vscode.commands.registerCommand(INITIALIZE_DOCUMENT_LIST_COMMAND, async (value: unknown) => {
      try {
        let root: vscode.Uri | undefined;
        if (value === undefined) {
          root = await projectRoot();
        } else if (
          typeof value === 'object' &&
          value !== null &&
          'root' in value &&
          value.root instanceof vscode.Uri
        ) {
          root = value.root;
        } else {
          throw new Error('Choose a project in the Phrase view.');
        }
        if (root === undefined) throw new Error('Open a folder with a phrase.yaml project file.');
        const result = await initializeDocumentList(await documentListStorage(root));
        if (!result.ok) throw new Error(result.message);
        await diagnostics.refresh(root);
      } catch (error) {
        await vscode.window.showErrorMessage(`Phrase: ${reasonOf(error)}`);
      }
    }),
    vscode.commands.registerCommand(MOVE_DOCUMENT_UP_COMMAND, move('up')),
    vscode.commands.registerCommand(MOVE_DOCUMENT_DOWN_COMMAND, move('down')),
    vscode.commands.registerCommand(REGROUP_DOCUMENT_COMMAND, async (value: unknown) => {
      try {
        const target = documentTarget(value);
        if (target === undefined) throw new Error('Choose a document in the Phrase view.');
        const storage = storageOf(target.root);
        const before = await storage.readText(PROJECT_FILE);
        const project = parseProject(before);
        if (project.diagnostics.length > 0) throw new Error('Fix the errors in phrase.yaml first.');
        if (project.settings.documents === undefined) {
          throw new Error('Initialize the document list before editing it.');
        }
        const picked = await vscode.window.showQuickPick(groupChoices(project.settings.documents), {
          placeHolder: 'Move the document to which group?',
        });
        if (picked === undefined) return;
        if ((await storage.readText(PROJECT_FILE)) !== before) {
          throw new Error('phrase.yaml changed. Choose the destination group again.');
        }
        await changeList(
          target.root,
          { kind: 'regroup', path: target.path, group: picked.trail },
          diagnostics,
          before,
        );
      } catch (error) {
        await vscode.window.showErrorMessage(`Phrase: ${reasonOf(error)}`);
      }
    }),
    vscode.commands.registerCommand(
      FIX_DOCUMENT_LIST_COMMAND,
      async (uri: unknown, action: unknown, path: unknown) => {
        try {
          if (
            !(uri instanceof vscode.Uri) ||
            (action !== 'append' && action !== 'remove') ||
            typeof path !== 'string'
          ) {
            throw new Error('Invalid document-list fix.');
          }
          const root = await findRoot(uri);
          if (root === undefined) throw new Error('No Phrase project found for this fix.');
          const loaded = await diagnostics.refresh(root);
          const applicable = loaded.diagnostics.some(
            ({ fix }) =>
              fix?.kind === 'document-list' && fix.action === action && fix.document === path,
          );
          if (!applicable) throw new Error('The document-list fix is no longer applicable.');
          if (action === 'remove') {
            const choice = await vscode.window.showWarningMessage(
              `Remove missing document "${path}" from the list? No files will be deleted.`,
              { modal: true },
              'Remove entry',
            );
            if (choice !== 'Remove entry') return;
            const current = await diagnostics.refresh(root);
            if (
              !current.diagnostics.some(
                ({ fix }) =>
                  fix?.kind === 'document-list' && fix.action === action && fix.document === path,
              )
            ) {
              throw new Error('The document-list fix is no longer applicable.');
            }
          }
          await changeList(root, { kind: action, path }, diagnostics);
        } catch (error) {
          await vscode.window.showErrorMessage(`Phrase: ${reasonOf(error)}`);
        }
      },
    ),
  ];
}
