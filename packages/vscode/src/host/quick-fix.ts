import * as vscode from 'vscode';
import { declareVariantInProject, parseFix, type StylesheetSaves } from './declare-variant.js';
import type { ProjectDiagnostics } from './project-diagnostics.js';
import { findRoot } from './project-files.js';

export const DECLARE_VARIANT_COMMAND = 'phrase.declareVariant';

/** Offers to allow a mark in a style, on the diagnostic that says the style does not (ADR 0026). */
class DeclareVariantActions implements vscode.CodeActionProvider {
  constructor(private readonly diagnostics: ProjectDiagnostics) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      const fix = this.diagnostics.fixOf(document.uri, diagnostic);
      if (fix === undefined) continue;
      const title = `Allow ${fix.mark} in the style "${fix.style}"`;
      const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.command = {
        command: DECLARE_VARIANT_COMMAND,
        title,
        arguments: [document.uri, fix.style, fix.mark],
      };
      actions.push(action);
    }
    return actions;
  }
}

/** The quick fix on the diagnostics of a document, and the command it runs. */
export function registerDeclareVariant(
  diagnostics: ProjectDiagnostics,
  saves: StylesheetSaves,
): vscode.Disposable[] {
  return [
    vscode.languages.registerCodeActionsProvider(
      { pattern: '**/*.phrase.md' },
      new DeclareVariantActions(diagnostics),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.commands.registerCommand(
      DECLARE_VARIANT_COMMAND,
      async (document: vscode.Uri, style: unknown, mark: unknown) => {
        const fix = parseFix(style, mark);
        const root = await findRoot(document);
        if (fix === undefined || root === undefined) {
          await vscode.window.showErrorMessage('The variant could not be declared.');
          return;
        }
        const outcome = await declareVariantInProject(root, fix.style, fix.mark);
        if (!outcome.ok) {
          await vscode.window.showErrorMessage(outcome.message);
          return;
        }
        saves.saveWith(document, outcome.document);
        await diagnostics.refresh(root);
      },
    ),
  ];
}
