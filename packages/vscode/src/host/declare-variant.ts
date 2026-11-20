import * as vscode from 'vscode';
import {
  VARIANT_MARKS,
  isStyleName,
  type DeclareVariantFix,
  type StyleName,
  type VariantMark,
} from '@stanza/core';
import { declareVariant } from '@stanza/format';
import { loadProject } from '@stanza/project';
import { lineEdit } from './line-diff.js';
import { storageOf, uriInProject } from './project-files.js';
import { normalized } from './review.js';

/** A style and a mark from a message, which is only data until it has been checked. */
export function parseFix(style: unknown, mark: unknown): DeclareVariantFix | undefined {
  const markName = VARIANT_MARKS.find((candidate) => candidate === mark);
  if (typeof style !== 'string' || !isStyleName(style) || markName === undefined) return undefined;
  return { kind: 'declare-variant', style, mark: markName };
}

export type DeclareOutcome =
  | {
      readonly ok: true;
      /** The stylesheet, changed in the editor and not saved (ADR 0026). */
      readonly document: vscode.TextDocument;
    }
  | { readonly ok: false; readonly message: string };

/**
 * The stylesheets that were changed for a document and are saved when that document is saved, so
 * that the change is not left behind in a file that nobody has in front of them.
 */
export class StylesheetSaves implements vscode.Disposable {
  private readonly waiting = new Map<string, vscode.TextDocument>();
  private readonly subscription: vscode.Disposable;

  constructor(private readonly log: vscode.OutputChannel) {
    this.subscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      const key = saved.uri.toString();
      const stylesheet = this.waiting.get(key);
      if (stylesheet === undefined) return;
      this.waiting.delete(key);
      if (!stylesheet.isDirty) return;
      stylesheet.save().then(undefined, (error: unknown) => {
        this.log.appendLine(`The stylesheet was not saved: ${String(error)}`);
      });
    });
  }

  /** The stylesheet is saved the next time `document` is. */
  saveWith(document: vscode.Uri, stylesheet: vscode.TextDocument): void {
    this.waiting.set(document.toString(), stylesheet);
  }

  dispose(): void {
    this.subscription.dispose();
  }
}

/** Replaces the text of an open document by `after`, as one edit that is not saved. */
export async function replaceText(
  document: vscode.TextDocument,
  before: string,
  after: string,
): Promise<boolean> {
  const edit = lineEdit(before, after);
  if (edit === undefined) return true;
  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.replace(
    document.uri,
    new vscode.Range(edit.start.line, edit.start.character, edit.end.line, edit.end.character),
    edit.text,
  );
  return vscode.workspace.applyEdit(workspaceEdit);
}

/**
 * Declares a variant in the stylesheet of a project, as an edit of the open document of the file.
 * The edit is not saved: the stylesheet is saved with the document that needed it, and until then
 * everything that reads the project sees the change, because it reads what is open.
 */
export async function declareVariantInProject(
  root: vscode.Uri,
  style: StyleName,
  mark: VariantMark,
): Promise<DeclareOutcome> {
  const loaded = await loadProject(storageOf(root));
  if (loaded.settings === undefined) {
    return { ok: false, message: 'The project file has errors, so its stylesheet is not known.' };
  }
  const document = await vscode.workspace.openTextDocument(
    uriInProject(root, loaded.settings.stylesheet),
  );
  const before = normalized(document.getText());
  const declared = declareVariant(before, style, mark);
  if (!declared.ok) return { ok: false, message: declared.message };
  if (!(await replaceText(document, before, declared.text))) {
    return { ok: false, message: 'The edit of the stylesheet was not applied.' };
  }
  return { ok: true, document };
}
