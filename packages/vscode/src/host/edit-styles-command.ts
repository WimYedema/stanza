import * as vscode from 'vscode';
import { DEFAULT_PAGE_TEMPLATE_NAME, PAGE_TEMPLATE_FIELD, applyDefaults } from '@stanza/core';
import { parseDocument } from '@stanza/format';
import { loadProjectConfiguration } from '@stanza/project';
import { activeFile, findRoot, pickedProjectFile, storageOf } from './project-files.js';
import {
  StylesEditorProvider,
  requestDocumentLayout,
  requestStyleSelection,
  type DocumentLayout,
  type StyleSelection,
} from './styles-provider.js';
import { locateStylesheet } from './styles-project.js';

export const EDIT_STYLES_COMMAND = 'stanza.editStyles';

const KINDS: readonly unknown[] = ['paragraph-style', 'character-style', 'table-style'];

/** The style to select, from the argument of the command, or nothing for anything else. */
function selectionOf(value: unknown): StyleSelection | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { kind, name } = value as { kind?: unknown; name?: unknown };
  if (!KINDS.includes(kind) || typeof name !== 'string' || name === '') return undefined;
  return { kind, name } as StyleSelection;
}

/**
 * The page layout a Stanza document uses (ADR 0096): its own `page-template`, else the default of
 * the project, else the default layout. Nothing for a file that is not a Stanza document.
 */
async function layoutOf(file: vscode.Uri): Promise<DocumentLayout | undefined> {
  if (!file.path.endsWith('.stanza.md')) return undefined;
  const root = await findRoot(file);
  if (root === undefined) return undefined;
  try {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
    const { settings } = await loadProjectConfiguration(storageOf(root));
    const meta = parseDocument(text).document.meta;
    const name = (settings === undefined ? meta : applyDefaults(settings, meta)).fields[
      PAGE_TEMPLATE_FIELD
    ];
    return {
      name: typeof name === 'string' ? name : DEFAULT_PAGE_TEMPLATE_NAME,
      document: file.path.slice(file.path.lastIndexOf('/') + 1),
    };
  } catch {
    return undefined;
  }
}

/**
 * "Stanza: Edit Styles" opens the stylesheet of the project of the file in front (ADR 0036). Given
 * a style, as the document editor does, it selects it (ADR 0054).
 */
export function registerEditStyles(): vscode.Disposable {
  return vscode.commands.registerCommand(EDIT_STYLES_COMMAND, async (style?: unknown) => {
    const from = activeFile() ?? (await pickedProjectFile());
    if (from === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: there is no project here. Open a folder that has a stanza.yaml file.',
      );
      return;
    }
    const found = await locateStylesheet(from);
    if (!found.ok) {
      void vscode.window.showErrorMessage(
        `Stanza: ${found.title}. ${found.reasons.map((reason) => reason.message).join(' ')}`,
      );
      return;
    }
    const selection = selectionOf(style);
    if (selection !== undefined) requestStyleSelection(found.uri, selection);
    const layout = await layoutOf(from);
    if (layout !== undefined) requestDocumentLayout(found.uri, layout);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      found.uri,
      StylesEditorProvider.viewType,
    );
  });
}
