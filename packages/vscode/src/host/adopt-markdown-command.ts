import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { adoptMarkdownDocument } from '@phrase/project';
import { registerBringIn } from './bring-in-command.js';

export const ADOPT_MARKDOWN_COMMAND = 'phrase.adoptMarkdown';

/**
 * "Phrase: Adopt Markdown File" adds an ordinary Markdown file to a project as a new document and
 * opens it. What the dialect cannot hold is written to the Phrase output (ADR 0060).
 */
export function registerAdoptMarkdown(log: vscode.OutputChannel): vscode.Disposable {
  return registerBringIn(
    {
      command: ADOPT_MARKDOWN_COMMAND,
      verb: 'Adopt',
      noun: 'adoption',
      past: 'adopted',
      dialogTitle: 'Choose the Markdown file to adopt',
      filters: { 'Markdown files': ['md', 'markdown'] },
      bring: (storage, bytes, name) =>
        adoptMarkdownDocument(storage, new TextDecoder().decode(bytes), {
          name,
          randomBytes: () => randomBytes(10),
        }),
    },
    log,
  );
}
