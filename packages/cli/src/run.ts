import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isSafeRelativePath, nodeIdFromRandomBytes } from '@stanza/core';
import {
  DEFAULT_BUILD_DATE,
  DOCUMENT_SUFFIX,
  buildProject,
  formatDocuments,
  formatProject,
  hasErrors,
  adoptMarkdownDocument,
  applyMigration,
  importWordDocument,
  describeImport,
  loadProject,
  planMigration,
  useTokensInStylesheet,
  type ProjectDiagnostic,
  type ProjectStorage,
  type SourceRevisions,
} from '@stanza/project';
import { gitRevisions } from './git-revisions.js';
import { nodeRemove, nodeStorage } from './node-storage.js';
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
  /** Where the documents of a project stand in Git; from `git` unless a test replaces it. */
  readonly revisions?: (root: string) => SourceRevisions;
}

const USAGE = `Usage: stanza <command> [project] [options]

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
  migrate [project]    Turn a project from before Phrase was renamed to Stanza into a Stanza
                       project: phrase.yaml becomes stanza.yaml, *.phrase.md becomes
                       *.stanza.md, and the markup in them uses the new names. IDs do not
                       change. Nothing is written when a new name is taken.

Options for build:
  --out <dir>          Output directory, relative to the project (default: build).
  --date <date>        The date written into the files, as YYYY-MM-DD or with a time and
                       zone. The default is 1980-01-01, so that output is always the same.

Options for format and migrate:
  --check              Write nothing; list the documents that are not canonical, or the files
                       that migrate would change.

Options for format:
  --assign-ids         Also give every heading and table without an ID a new one, unique in
                       the project. With --check, a missing ID counts as not canonical.
                       Needs a project, not a single file.
  --fix-stylesheet     Also move the hex colors and font lists in the styles of the stylesheet
                       into tokens (errors raw-color and raw-font), with a token named after
                       each value that has none. Comments and layout stay. With --check, the
                       stylesheet is listed and not changed. Needs a project.
  --fix-references     Explicitly update stale reference filename hints by immutable ID.
                       Needs a project; respects --file and --check.

Options for validate and format:
  --file <path>        Select a .stanza.md file relative to the project; repeat for more files.
                       Needs a project directory. Validation keeps project-wide ID/reference
                       context; formatting writes only selected files.

Options for validate:
  --max-diagnostics <N>
                       Print at most N diagnostics (positive integer); still check everything
                       in scope, report total counts and return the full exit status.

Other options:
  -h, --help           Show this help.
  -v, --version        Show the versions of stanza and of the DOCX library.

The project is a directory with a stanza.yaml file; the default is the current directory.
Exit codes: 0 no errors, 1 errors in the project (or, with --check, documents that are not
canonical or a project to migrate), 2 wrong usage or a file that cannot be read.
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
  const fix =
    d.fix?.kind === 'declare-variant'
      ? ` Suggestion: declare the "${d.fix.mark}" variant on style "${d.fix.style}" if intended.`
      : d.fix?.kind === 'reference-path'
        ? ` Suggestion: replace "${d.fix.href}" with "${d.fix.replacement}", or run "stanza format --fix-references".`
        : d.fix?.kind === 'use-tokens'
          ? ' Suggestion: run "stanza format --fix-stylesheet".'
          : d.fix?.kind === 'document-list'
            ? ` Suggestion: ${d.fix.action === 'append' ? 'add' : 'remove'} "${d.fix.document}" ${d.fix.action === 'append' ? 'to' : 'from'} the documents list in stanza.yaml.`
            : '';
  return `${where}: ${d.severity} ${d.code}: ${d.message}${path}${fix}\n`;
}

function summary(documents: number, diagnostics: readonly ProjectDiagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const hint = diagnostics.some((d) => d.code === 'raw-color' || d.code === 'raw-font')
    ? 'Run "stanza format --fix-stylesheet" to move those colors and fonts into tokens.\n'
    : '';
  return `${hint}Checked ${plural(documents, 'document')}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}.\n`;
}

function exitCode(diagnostics: readonly ProjectDiagnostic[]): number {
  if (diagnostics.some((d) => d.code === 'file-unreadable')) return 2;
  return hasErrors(diagnostics) ? 1 : 0;
}

/** Runs the command line and returns the exit code. */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const usage = (message: string): number => {
    io.stderr(`stanza: ${message}\n\n${USAGE}`);
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
        'fix-stylesheet': { type: 'boolean' },
        'fix-references': { type: 'boolean' },
        file: { type: 'string', multiple: true },
        'max-diagnostics': { type: 'string' },
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
    io.stdout(`stanza ${cliVersion()} (docx ${docxVersion()})\n`);
    return 0;
  }

  const [command, project = '.', ...extra] = positionals;
  if (
    command !== 'validate' &&
    command !== 'build' &&
    command !== 'format' &&
    command !== 'import' &&
    command !== 'adopt' &&
    command !== 'migrate'
  ) {
    return usage(command === undefined ? 'no command given.' : `unknown command "${command}".`);
  }
  if (command === 'import' || command === 'adopt') {
    if (
      values.out !== undefined ||
      values.date !== undefined ||
      values.check === true ||
      values.file !== undefined ||
      values['max-diagnostics'] !== undefined ||
      values['assign-ids'] === true ||
      values['fix-stylesheet'] === true ||
      values['fix-references'] === true
    ) {
      return usage(`${command} takes no options.`);
    }
    const word = command === 'import';
    const [file, folder = '.', ...more] = positionals.slice(1);
    if (file === undefined || !(word ? isWordFile : isMarkdownFile)(file)) {
      return usage(
        word
          ? 'import needs a Word file, as in: stanza import report.docx [project].'
          : 'adopt needs a Markdown file, as in: stanza adopt notes.md [project].',
      );
    }
    if (more.length > 0) return usage(`unexpected argument "${more.join(' ')}".`);
    let bytes: Uint8Array;
    try {
      bytes = await (io.readBytes ?? readFile)(resolve(io.cwd, file));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      io.stderr(`stanza: cannot read ${file}: ${reason}\n`);
      return 2;
    }
    const storage = (io.openStorage ?? nodeStorage)(resolve(io.cwd, folder));
    const options = { name: basename(file, extname(file)), randomBytes: () => randomBytes(10) };
    const brought = word
      ? await importWordDocument(storage, bytes, options)
      : await adoptMarkdownDocument(storage, new TextDecoder().decode(bytes), options);
    if (!brought.ok) {
      io.stderr(`stanza: ${brought.message}\n`);
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
  const files =
    values.file === undefined
      ? undefined
      : [...new Set(values.file.map((file) => file.replace(/\\/g, '/')))].sort();
  if (files !== undefined) {
    if (command !== 'validate' && command !== 'format') {
      return usage('--file applies to validate and format only.');
    }
    if (project.endsWith(DOCUMENT_SUFFIX)) return usage('--file needs a project directory.');
    if (files.some((file) => !isSafeRelativePath(file) || !file.endsWith(DOCUMENT_SUFFIX))) {
      return usage('--file must name a relative .stanza.md path inside the project, without "..".');
    }
  }
  const maxText = values['max-diagnostics'];
  const maxDiagnostics = maxText === undefined ? undefined : Number(maxText);
  if (maxText !== undefined) {
    if (command !== 'validate') return usage('--max-diagnostics applies to validate only.');
    if (!/^[1-9]\d*$/.test(maxText) || !Number.isSafeInteger(maxDiagnostics)) {
      return usage('--max-diagnostics must be a positive safe integer.');
    }
  }
  if (command !== 'build' && (values.out !== undefined || values.date !== undefined)) {
    return usage('--out and --date apply to build only.');
  }
  if (command !== 'format' && command !== 'migrate' && values.check === true) {
    return usage('--check applies to format and migrate only.');
  }
  const assignIds = values['assign-ids'] === true;
  if (command !== 'format' && assignIds) return usage('--assign-ids applies to format only.');
  if (assignIds && project.endsWith(DOCUMENT_SUFFIX)) {
    return usage('--assign-ids needs a project directory, to keep IDs unique across documents.');
  }
  const fixStylesheet = values['fix-stylesheet'] === true;
  const fixReferences = values['fix-references'] === true;
  if (fixReferences && (command !== 'format' || project.endsWith(DOCUMENT_SUFFIX))) {
    return usage('--fix-references needs format with a project directory.');
  }
  if (command !== 'format' && fixStylesheet) {
    return usage('--fix-stylesheet applies to format only.');
  }
  if (fixStylesheet && files !== undefined) {
    return usage(
      '--fix-stylesheet cannot be combined with --file; it changes the shared stylesheet.',
    );
  }
  if (fixStylesheet && project.endsWith(DOCUMENT_SUFFIX)) {
    return usage('--fix-stylesheet needs a project directory, as the stylesheet belongs to one.');
  }

  const open = io.openStorage ?? nodeStorage;

  if (command === 'format') {
    const target = resolve(io.cwd, project);
    const options = {
      check: values.check === true,
      ...(files === undefined ? {} : { files }),
      ...(fixReferences ? { fixReferences: true } : {}),
      ...(assignIds
        ? { generateId: io.generateId ?? ((): string => nodeIdFromRandomBytes(randomBytes(10))) }
        : {}),
    };
    const stylesheet = fixStylesheet
      ? await useTokensInStylesheet(open(target), { check: options.check })
      : undefined;
    const result = project.endsWith(DOCUMENT_SUFFIX)
      ? await formatDocuments(open(dirname(target)), [basename(target)], options)
      : await formatProject(open(target), options);
    const word = options.check ? 'not canonical' : 'reformatted';
    const count = (status: string): number =>
      result.files.filter((f) => f.status === status).length;
    if (stylesheet?.status === 'changed') {
      const moved = `${plural(stylesheet.moved, 'value')} to tokens, ${plural(stylesheet.added, 'token')} added`;
      io.stdout(`${word} ${stylesheet.path ?? ''} (${moved})\n`);
    }
    io.stdout(
      stylesheet === undefined ? '' : stylesheet.diagnostics.map(formatDiagnostic).join(''),
    );
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
    if (
      result.diagnostics.some((d) => d.code === 'file-unreadable') ||
      stylesheet?.diagnostics.some((d) => d.code === 'file-unreadable') === true
    ) {
      return 2;
    }
    return count('refused') > 0 ||
      hasErrors(result.diagnostics) ||
      stylesheet?.status === 'refused' ||
      (options.check && (count('changed') > 0 || stylesheet?.status === 'changed'))
      ? 1
      : 0;
  }

  const root = resolve(io.cwd, project);
  const storage = open(root);

  if (command === 'migrate') {
    const plan = await planMigration(storage);
    io.stdout(plan.diagnostics.map(formatDiagnostic).join(''));
    if (plan.alreadyMigrated) {
      io.stdout('This is a Stanza project already; there is nothing to migrate.\n');
      return 0;
    }
    if (plan.steps.length === 0) {
      io.stdout('Nothing was written.\n');
      return exitCode(plan.diagnostics);
    }
    const check = values.check === true;
    for (const step of plan.steps) {
      const what = step.from === step.to ? step.to : `${step.from} -> ${step.to}`;
      io.stdout(
        `${check ? 'to migrate' : 'migrated'} ${what} (${plural(step.changes, 'change')})\n`,
      );
    }
    if (!check) await applyMigration(storage, plan, nodeRemove(root));
    for (const note of plan.notes) io.stdout(`Note: ${note}\n`);
    const total = plural(plan.steps.length, 'file');
    io.stdout(
      check
        ? `${total} to migrate; run without --check to write them.\n`
        : `Migrated ${total}; IDs are unchanged. Run "stanza validate" and commit: Git shows the renames.\n`,
    );
    return check ? 1 : 0;
  }

  if (command === 'validate') {
    const loaded = await loadProject(storage);
    const selected = files === undefined ? undefined : new Set(files);
    const diagnostics = loaded.diagnostics.filter(
      (d) =>
        selected === undefined ||
        selected.has(d.file) ||
        !d.file.endsWith(DOCUMENT_SUFFIX) ||
        d.code === 'duplicate-id' ||
        d.code === 'file-unreadable',
    );
    if (
      selected !== undefined &&
      loaded.settings !== undefined &&
      loaded.stylesheet !== undefined
    ) {
      for (const file of selected) {
        if (
          !loaded.documents.some((entry) => entry.path === file) &&
          !diagnostics.some((d) => d.file === file && d.code === 'file-unreadable')
        ) {
          diagnostics.push({
            file,
            severity: 'error',
            code: 'invalid-selection',
            message: 'Select an existing .stanza.md document inside this project.',
          });
        }
      }
    }
    io.stdout(diagnostics.slice(0, maxDiagnostics).map(formatDiagnostic).join(''));
    if (maxDiagnostics !== undefined && diagnostics.length > maxDiagnostics) {
      io.stdout(
        `${String(diagnostics.length - maxDiagnostics)} diagnostics omitted; increase --max-diagnostics to see more.\n`,
      );
    }
    const count =
      selected === undefined
        ? loaded.documents.length
        : loaded.documents.filter((entry) => selected.has(entry.path)).length;
    if (selected !== undefined) {
      io.stdout(
        'Selected-file validation with project-wide ID/reference context (not a full-project check).\n',
      );
    }
    io.stdout(summary(count, diagnostics));
    return exitCode(diagnostics);
  }

  const timestamp = values.date === undefined ? DEFAULT_BUILD_DATE : parseDate(values.date);
  if (timestamp === undefined) {
    return usage('--date must be YYYY-MM-DD, or with a time and zone, in 1980 to 2099.');
  }
  const outDir = (values.out ?? 'build').replace(/\/+$/, '');
  if (!isSafeRelativePath(outDir)) {
    return usage('--out must be a relative path with "/" separators and no "..".');
  }
  const result = await buildProject(storage, {
    outDir,
    timestamp,
    revisions: (io.revisions ?? gitRevisions)(root),
  });
  io.stdout(result.diagnostics.map(formatDiagnostic).join(''));
  io.stdout(summary(result.documents, result.diagnostics));
  const code = exitCode(result.diagnostics);
  if (code === 0) {
    io.stdout(`Wrote ${plural(result.written.length, 'file')} to ${outDir}/.\n`);
    io.stdout(`stanza ${cliVersion()}, docx ${docxVersion()}, date ${timestamp.toISOString()}.\n`);
  } else {
    io.stdout('Nothing was written.\n');
  }
  return code;
}
