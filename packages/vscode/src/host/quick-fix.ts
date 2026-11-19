import * as vscode from 'vscode';
import { moveValuesToTokens, parseDocument, serializeDocument } from '@phrase/format';
import { mapDocumentLinks } from '@phrase/core';
import {
  declareVariantInProject,
  parseFix,
  replaceText,
  type StylesheetSaves,
} from './declare-variant.js';
import type { ProjectDiagnostics } from './project-diagnostics.js';
import { findRoot } from './project-files.js';
import { normalized } from './review.js';
import { FIX_DOCUMENT_LIST_COMMAND } from './document-list-commands.js';

export const DECLARE_VARIANT_COMMAND = 'phrase.declareVariant';
export const USE_TOKENS_COMMAND = 'phrase.useTokens';
export const FIX_REFERENCE_PATH_COMMAND = 'phrase.fixReferencePath';

/** Offers the fix that a diagnostic carries (ADR 0026, ADR 0074). */
class FixActions implements vscode.CodeActionProvider {
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
      if (fix.kind === 'document-list') {
        const title =
          fix.action === 'append'
            ? `Add "${fix.document}" to the document list`
            : `Remove missing document "${fix.document}" from the list`;
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: FIX_DOCUMENT_LIST_COMMAND,
          title,
          arguments: [document.uri, fix.action, fix.document],
        };
        actions.push(action);
        continue;
      }
      const title =
        fix.kind === 'declare-variant'
          ? `Allow ${fix.mark} in the style "${fix.style}"`
          : fix.kind === 'reference-path'
            ? `Update reference path to "${fix.replacement}"`
            : 'Move the colors and fonts of the styles into tokens';
      const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.command =
        fix.kind === 'declare-variant'
          ? {
              command: DECLARE_VARIANT_COMMAND,
              title,
              arguments: [document.uri, fix.style, fix.mark],
            }
          : fix.kind === 'reference-path'
            ? { command: FIX_REFERENCE_PATH_COMMAND, title, arguments: [document.uri, fix.href] }
            : { command: USE_TOKENS_COMMAND, title, arguments: [document.uri] };
      actions.push(action);
    }
    return actions;
  }
}

/**
 * Moves the raw colors and fonts of an open stylesheet into tokens, as an edit that is not saved:
 * the author sees the change and saves it, and until then the project is read as edited.
 */
async function useTokensIn(uri: vscode.Uri, diagnostics: ProjectDiagnostics): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const before = normalized(document.getText());
  const moved = moveValuesToTokens(before);
  if (!moved.ok) {
    await vscode.window.showErrorMessage(moved.message);
    return;
  }
  if (!(await replaceText(document, before, moved.text))) {
    await vscode.window.showErrorMessage('The edit of the stylesheet was not applied.');
    return;
  }
  const root = await findRoot(uri);
  if (root !== undefined) await diagnostics.refresh(root);
}

/** The quick fixes on the diagnostics of a document or a stylesheet, and the commands they run. */
export function registerDeclareVariant(
  diagnostics: ProjectDiagnostics,
  saves: StylesheetSaves,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      FIX_REFERENCE_PATH_COMMAND,
      async (uri: unknown, href: unknown) => {
        if (!(uri instanceof vscode.Uri) || typeof href !== 'string') {
          await vscode.window.showErrorMessage('Phrase: invalid reference path fix.');
          return;
        }
        const root = await findRoot(uri);
        if (root === undefined) {
          await vscode.window.showErrorMessage('Phrase: no project found for this reference.');
          return;
        }
        const loaded = await diagnostics.refresh(root);
        const file = uri.path.slice(root.path.length + 1);
        const fixes = loaded.diagnostics.filter(
          (d) => d.file === file && d.fix?.kind === 'reference-path' && d.fix.href === href,
        );
        if (fixes.length === 0) {
          await vscode.window.showErrorMessage(
            'Phrase: the reference path fix is no longer applicable.',
          );
          return;
        }
        const document =
          vscode.workspace.textDocuments.find((open) => open.uri.toString() === uri.toString()) ??
          (await vscode.workspace.openTextDocument(uri));
        const before = normalized(document.getText());
        const parsed = parseDocument(before);
        if (parsed.diagnostics.length > 0) {
          await vscode.window.showErrorMessage(
            'Phrase: fix the document syntax before updating reference paths.',
          );
          return;
        }
        if (serializeDocument(parsed.document) !== before) {
          await vscode.window.showErrorMessage(
            'Phrase: format this document before applying a reference path quick fix, or use phrase format --fix-references.',
          );
          return;
        }
        const fixed = mapDocumentLinks(parsed.document, (value, path) => {
          const fix = fixes.find(
            (d) => d.path === path && d.fix?.kind === 'reference-path' && d.fix.href === value,
          )?.fix;
          if (fix?.kind !== 'reference-path') return value;
          return fix.replacement;
        });
        const after = serializeDocument(fixed);
        if (after === before) {
          await vscode.window.showErrorMessage(
            'Phrase: the reference changed; request its path fix again.',
          );
          return;
        }
        if (!(await replaceText(document, before, after))) {
          await vscode.window.showErrorMessage('Phrase: the reference path edit was not applied.');
          return;
        }
        await diagnostics.refresh(root);
      },
    ),
    vscode.languages.registerCodeActionsProvider(
      [{ pattern: '**/*.phrase.md' }, { pattern: '**/*.{yaml,yml}' }],
      new FixActions(diagnostics),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.commands.registerCommand(USE_TOKENS_COMMAND, async (uri: unknown) => {
      if (uri instanceof vscode.Uri) await useTokensIn(uri, diagnostics);
    }),
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
