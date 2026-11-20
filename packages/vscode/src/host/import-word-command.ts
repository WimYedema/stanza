import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { importWordDocument } from '@stanza/project';
import { registerBringIn } from './bring-in-command.js';

export const IMPORT_WORD_COMMAND = 'stanza.importWord';

/**
 * "Stanza: Import Word Document" adds the content of a DOCX to a project as a new document and
 * opens it. What could not be carried over is written to the Stanza output (ADR 0047).
 */
export function registerImportWord(log: vscode.OutputChannel): vscode.Disposable {
  return registerBringIn(
    {
      command: IMPORT_WORD_COMMAND,
      verb: 'Import',
      noun: 'import',
      past: 'imported',
      dialogTitle: 'Choose the Word document to import',
      filters: { 'Word documents': ['docx'] },
      bring: (storage, bytes, name) =>
        importWordDocument(storage, bytes, { name, randomBytes: () => randomBytes(10) }),
    },
    log,
  );
}
