import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isSafeRelativePath, nodeIdFromRandomBytes } from '@phrase/core';
import {
  DEFAULT_BUILD_DATE,
  DOCUMENT_SUFFIX,
  buildProject,
  formatDocuments,
  formatProject,
  hasErrors,
  adoptMarkdownDocument,
  importWordDocument,
  describeImport,
  loadProject,
  type ProjectDiagnostic,
  type ProjectStorage,
} from '@phrase/project';
import { nodeStorage } from './node-storage.js';
import { cliVersion, docxVersion } from './versions.js';

export interface Io {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** The storage for a project directory; the Node filesystem unless a test replaces it. */
  readonly openStorage?: (root: string) => ProjectStorage;
  /** The source of new IDs; random unless a test replaces it. */
  readonly generateId?: () => string;
  /** The bytes of a Word file; read from the filesystem unless a test replaces it. */
  readonly readBytes?: (path: string) => Promise<Uint8Array>;
}

const USAGE = `Usage: phrase <command> [project] [options]

Commands:
  validate [project]   Check the project and report problems.
  build [project]      Check the project and write one DOCX file per document.
  format [path]        Rewrite documents in canonical form. The path is a project, or a
                       single ${DOCUMENT_SUFFIX} file. A document that holds something the
                       model cannot keep is reported and left as it is.
  import <file.docx> [project]
                       Add the content of a Word document to the project as a new
                       ${DOCUMENT_SUFFIX} document in documents/, named after the file, with IDs
                       given. An existing document is never replaced: a taken name gets a
                       number. What could not be carried over is listed.
  adopt <file.md> [project]
                       Add an ordinary Markdown file to the project as a new ${DOCUMENT_SUFFIX}
                       document, in the same way as import. The original is not changed. What
                       the dialect cannot hold is listed.

Options for build:
  --out <dir>          Output directory, relative to the project (default: build).
  --date <date>        The date written into the files, as YYYY-MM-DD or with a time and
                       zone. The default is 1980-01-01, so that output is always the same.

Options for format:
  --check              Write nothing; list the documents that are not canonical.
  --assign-ids         Also give every heading and table without an ID a new one, unique in
                       the project. With --check, a missing ID counts as not canonical.
                       Needs a project, not a single file.

Other options:
  -h, --help           Show this help.
  -v, --version        Show the versions of phrase and of the DOCX library.

The project is a directory with a phrase.yaml file; the default is the current directory.
Exit codes: 0 no errors, 1 errors in the project (or, with --check, documents that are not
canonical), 2 wrong usage or a file that cannot be read.
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** A date or a date with a time and zone, within the years the zip format can hold. */
function parseDate(text: string): Date | undefined {
  if (!DATE_PATTERN.test(text)) return undefined;
  const date = new Date(text);
  const year = date.getUTCFullYear();
  return Number.isNaN(date.getTime()) || year < 1980 || year > 2099 ? undefined : date;
}

const isWordFile = (file: string): boolean => extname(file).toLowerCase() === '.docx';
const isMarkdownFile = (file: string): boolean => /^\.(md|markdown)$/i.test(extname(file));

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

function formatDiagnostic(d: ProjectDiagnostic): string {
  const where = d.line === undefined ? d.file : `${d.file}:${String(d.line)}`;
  const path = d.path === undefined ? '' : ` [${d.path}]`;
  return `${where}: ${d.severity} ${d.code}: ${d.message}${path}\n`;
}

function summary(documents: number, diagnostics: readonly ProjectDiagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  return `Checked ${plural(documents, 'document')}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}.\n`;
}

function exitCode(diagnostics: readonly ProjectDiagnostic[]): number {
  if (diagnostics.some((d) => d.code === 'file-unreadable')) return 2;
  return hasErrors(diagnostics) ? 1 : 0;
}

/** Runs the command line and returns the exit code. */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const usage = (message: string): number => {
    io.stderr(`phrase: ${message}\n\n${USAGE}`);
    return 2;
  };

  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        date: { type: 'string' },
        check: { type: 'boolean' },
        'assign-ids': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help === true) {
    io.stdout(USAGE);
    return 0;
  }
  if (values.version === true) {
    io.stdout(`phrase ${cliVersion()} (docx ${docxVersion()})\n`);
    return 0;
  }

  const [command, project = '.', ...extra] = positionals;
  if (
    command !== 'validate' &&
    command !== 'build' &&
    command !== 'format' &&
    command !== 'import' &&
    command !== 'adopt'
  ) {
    return usage(command === undefined ? 'no command given.' : `unknown command "${command}".`);
  }
  if (command === 'import' || command === 'adopt') {
    if (
      values.out !== undefined ||
      values.date !== undefined ||
      values.check === true ||
      values['assign-ids'] === true
    ) {
      return usage(`${command} takes no options.`);
    }
    const word = command === 'import';
    const [file, folder = '.', ...more] = positionals.slice(1);
    if (file === undefined || !(word ? isWordFile : isMarkdownFile)(file)) {
      return usage(
        word
          ? 'import needs a Word file, as in: phrase import report.docx [project].'
          : 'adopt needs a Markdown file, as in: phrase adopt notes.md [project].',
      );
    }
    if (more.length > 0) return usage(`unexpected argument "${more.join(' ')}".`);
    let bytes: Uint8Array;
    try {
      bytes = await (io.readBytes ?? readFile)(resolve(io.cwd, file));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      io.stderr(`phrase: cannot read ${file}: ${reason}\n`);
      return 2;
    }
    const storage = (io.openStorage ?? nodeStorage)(resolve(io.cwd, folder));
    const options = { name: basename(file, extname(file)), randomBytes: () => randomBytes(10) };
    const brought = word
      ? await importWordDocument(storage, bytes, options)
      : await adoptMarkdownDocument(storage, new TextDecoder().decode(bytes), options);
    if (!brought.ok) {
      io.stderr(`phrase: ${brought.message}\n`);
      return 2;
    }
    const ids = plural(brought.assigned, 'ID');
    io.stdout(
      `${word ? 'Imported' : 'Adopted'} ${file} as ${brought.document} (${ids} assigned).\n`,
    );
    for (const line of describeImport(brought.report)) io.stdout(`  ${line}\n`);
    io.stdout(brought.diagnostics.map(formatDiagnostic).join(''));
    return hasErrors(brought.diagnostics) ? 1 : 0;
  }
  if (extra.length > 0) return usage(`unexpected argument "${extra.join(' ')}".`);
  if (command !== 'build' && (values.out !== undefined || values.date !== undefined)) {
    return usage('--out and --date apply to build only.');
  }
  if (command !== 'format' && values.check === true) {
    return usage('--check applies to format only.');
  }
  const assignIds = values['assign-ids'] === true;
  if (command !== 'format' && assignIds) return usage('--assign-ids applies to format only.');
  if (assignIds && project.endsWith(DOCUMENT_SUFFIX)) {
    return usage('--assign-ids needs a project directory, to keep IDs unique across documents.');
  }

  const open = io.openStorage ?? nodeStorage;

  if (command === 'format') {
    const target = resolve(io.cwd, project);
    const options = {
      check: values.check === true,
      ...(assignIds
        ? { generateId: io.generateId ?? ((): string => nodeIdFromRandomBytes(randomBytes(10))) }
        : {}),
    };
    const result = project.endsWith(DOCUMENT_SUFFIX)
      ? await formatDocuments(open(dirname(target)), [basename(target)], options)
      : await formatProject(open(target), options);
    const word = options.check ? 'not canonical' : 'reformatted';
    const count = (status: string): number =>
      result.files.filter((f) => f.status === status).length;
    for (const file of result.files) {
      if (file.status !== 'changed') continue;
      const ids =
        file.assigned === 0
          ? ''
          : ` (${plural(file.assigned, 'ID')} ${options.check ? 'missing' : 'assigned'})`;
      io.stdout(`${word} ${file.path}${ids}\n`);
    }
    io.stdout(result.diagnostics.map(formatDiagnostic).join(''));
    const total = result.files.reduce((sum, file) => sum + file.assigned, 0);
    const ids = assignIds
      ? `, ${plural(total, 'ID')} ${options.check ? 'missing' : 'assigned'}`
      : '';
    io.stdout(
      `Checked ${plural(result.files.length, 'document')}: ${String(count('changed'))} ${word}, ${String(count('refused'))} refused${ids}.\n`,
    );
    if (result.diagnostics.some((d) => d.code === 'file-unreadable')) return 2;
    return count('refused') > 0 ||
      hasErrors(result.diagnostics) ||
      (options.check && count('changed') > 0)
      ? 1
      : 0;
  }

  const storage = open(resolve(io.cwd, project));

  if (command === 'validate') {
    const loaded = await loadProject(storage);
    io.stdout(loaded.diagnostics.map(formatDiagnostic).join(''));
    io.stdout(summary(loaded.documents.length, loaded.diagnostics));
    return exitCode(loaded.diagnostics);
  }

  const timestamp = values.date === undefined ? DEFAULT_BUILD_DATE : parseDate(values.date);
  if (timestamp === undefined) {
    return usage('--date must be YYYY-MM-DD, or with a time and zone, in 1980 to 2099.');
  }
  const outDir = (values.out ?? 'build').replace(/\/+$/, '');
  if (!isSafeRelativePath(outDir)) {
    return usage('--out must be a relative path with "/" separators and no "..".');
  }
  const result = await buildProject(storage, { outDir, timestamp });
  io.stdout(result.diagnostics.map(formatDiagnostic).join(''));
  io.stdout(summary(result.documents, result.diagnostics));
  const code = exitCode(result.diagnostics);
  if (code === 0) {
    io.stdout(`Wrote ${plural(result.written.length, 'file')} to ${outDir}/.\n`);
    io.stdout(`phrase ${cliVersion()}, docx ${docxVersion()}, date ${timestamp.toISOString()}.\n`);
  } else {
    io.stdout('Nothing was written.\n');
  }
  return code;
}
