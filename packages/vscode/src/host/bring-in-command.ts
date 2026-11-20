import * as vscode from 'vscode';
import { describeImport, type ProjectStorage } from '@stanza/project';
import { projectRoot, uriInProject } from './project-files.js';
import { documentListStorage } from './document-list-commands.js';

const SHOW_REPORT = 'Show report';

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The file name without its folder, and the name without its extension. */
const fileOf = (uri: vscode.Uri): string => uri.path.slice(uri.path.lastIndexOf('/') + 1);
const nameOf = (uri: vscode.Uri): string => {
  const file = fileOf(uri);
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
};

/** What a command that brings a file from outside into a project as a new document says and does. */
export interface BringIn {
  readonly command: string;
  /** Capitalised, as in "Import": the label of the dialog button and the start of the log line. */
  readonly verb: string;
  /** `import` or `adoption`, as in "the import failed" and "nothing was imported". */
  readonly noun: string;
  readonly past: string;
  readonly dialogTitle: string;
  readonly filters: Readonly<Record<string, string[]>>;
  readonly bring: (
    storage: ProjectStorage,
    bytes: Uint8Array,
    name: string,
  ) => Promise<
    | {
        readonly ok: true;
        readonly document: string;
        readonly report: Parameters<typeof describeImport>[0];
        readonly diagnostics: readonly { severity: string; code: string; message: string }[];
      }
    | { readonly ok: false; readonly message: string }
  >;
}

/**
 * Registers a command that asks for a file, writes it into the project as a new document, opens it
 * in the Stanza editor, and writes the report to the Stanza output (ADR 0047, 0060).
 */
export function registerBringIn(spec: BringIn, log: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand(spec.command, async () => {
    const root = await projectRoot();
    if (root === undefined) {
      void vscode.window.showErrorMessage(
        'Stanza: there is no project here. Open a folder that has a stanza.yaml file.',
      );
      return;
    }
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: spec.verb,
      title: spec.dialogTitle,
      filters: { ...spec.filters },
    });
    const file = picked?.[0];
    if (file === undefined) return;

    let result;
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      result = await spec.bring(await documentListStorage(root), bytes, nameOf(file));
    } catch (error) {
      void vscode.window.showErrorMessage(`Stanza: the ${spec.noun} failed. ${reasonOf(error)}`);
      return;
    }
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Stanza: nothing was ${spec.past}. ${result.message}`);
      return;
    }

    log.appendLine(`${spec.verb}ed ${fileOf(file)} as ${result.document}.`);
    for (const line of describeImport(result.report)) log.appendLine(`  ${line}`);
    for (const d of result.diagnostics) log.appendLine(`  ${d.severity}: ${d.code}: ${d.message}`);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uriInProject(root, result.document),
      'stanza.editor',
    );
    const notes = result.report.diagnostics.length;
    const choice = await vscode.window.showInformationMessage(
      `Stanza: ${spec.past} ${result.document}. The report has ${String(notes)} ${notes === 1 ? 'entry' : 'entries'}.`,
      SHOW_REPORT,
    );
    if (choice === SHOW_REPORT) log.show();
  });
}
