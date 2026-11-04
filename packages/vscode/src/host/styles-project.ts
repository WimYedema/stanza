import * as vscode from 'vscode';
import { PROJECT_FILE } from '@phrase/project';
import { parseProject } from '@phrase/format';
import type { Reason } from '../shared/protocol.js';
import { findRoot, storageOf, uriInProject } from './project-files.js';

export type StylesheetLocation =
  | { readonly ok: true; readonly uri: vscode.Uri; readonly path: string }
  | { readonly ok: false; readonly title: string; readonly reasons: readonly Reason[] };

const no = (title: string, ...messages: string[]): StylesheetLocation => ({
  ok: false,
  title,
  reasons: messages.map((message) => ({ message })),
});

/** The stylesheet of the project that a file is in, or why there is none (ADR 0036). */
export async function locateStylesheet(file: vscode.Uri): Promise<StylesheetLocation> {
  const root = await findRoot(file);
  if (root === undefined) {
    return no(
      'This file is not in a Phrase project',
      'No phrase.yaml was found in the folder of this file or in a folder above it, inside the workspace folder.',
    );
  }
  let text: string;
  try {
    text = await storageOf(root).readText(PROJECT_FILE);
  } catch {
    return no('The project file cannot be read', `${PROJECT_FILE} could not be read.`);
  }
  const project = parseProject(text);
  const errors = project.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    return {
      ok: false,
      title: 'The project has errors',
      reasons: errors
        .slice(0, 10)
        .map((error) => ({ message: `${PROJECT_FILE}: ${error.message}` })),
    };
  }
  const path = project.settings.stylesheet;
  return { ok: true, uri: uriInProject(root, path), path };
}
