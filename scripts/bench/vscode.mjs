// Starting the installed VS Code for the measurements of ADR 0101: a new profile with nothing but
// the built-in extensions and Stanza from packages/vscode, and a wait until VS Code has quit.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const extension = join(repo, 'packages', 'vscode');

/** Stops with a message when Stanza has not been built. */
export function requireBuild() {
  if (!existsSync(join(extension, 'dist', 'extension.cjs'))) {
    console.error('Stanza is not built; run npm run build first.');
    process.exit(2);
  }
}

/** The nearest folder up from the document with a stanza.yaml, or the folder of the document. */
export function projectFolder(document) {
  for (let folder = dirname(document); ; folder = dirname(folder)) {
    if (existsSync(join(folder, 'stanza.yaml'))) return folder;
    if (dirname(folder) === folder) return dirname(document);
  }
}

/**
 * A new user data folder and an empty extensions folder. No window from a run before, no start
 * page, and nothing fetched or sent while measuring; `settings` adds to that.
 */
export function newProfile(prefix, settings = {}) {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  const profile = {
    folder,
    userData: join(folder, 'user-data'),
    extensions: join(folder, 'extensions'),
  };
  mkdirSync(profile.extensions);
  mkdirSync(join(profile.userData, 'User'), { recursive: true });
  writeFileSync(
    join(profile.userData, 'User', 'settings.json'),
    `${JSON.stringify(
      {
        'window.restoreWindows': 'none',
        'workbench.startupEditor': 'none',
        'update.mode': 'none',
        'extensions.autoCheckUpdates': false,
        'extensions.autoUpdate': false,
        'telemetry.telemetryLevel': 'off',
        // In a new profile VS Code 1.148 opens a .stanza.md file as text without this (item 239).
        'workbench.editorAssociations': { '*.stanza.md': 'stanza.editor' },
        ...settings,
      },
      null,
      2,
    )}\n`,
  );
  return profile;
}

export function removeProfile(profile) {
  try {
    rmSync(profile.folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    console.error(`Could not remove ${profile.folder}; a VS Code window may still be open.`);
  }
}

// `code.cmd` finds VS Code from its own name, which it cannot when that name is quoted.
const quote = (value) =>
  /[\s"&|<>^]/.test(String(value)) ? `"${String(value).replaceAll('"', '\\"')}"` : String(value);
export const now = () => performance.timeOrigin + performance.now();
export const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Starts VS Code on the project of a document with that document open, and waits until it quits;
 * when it started. Stanza quits it when `env` asks for a measurement.
 */
export async function launch({ code, profile, document, env, timeoutMs }) {
  const args = [
    '--new-window',
    '--wait',
    `--user-data-dir=${profile.userData}`,
    `--extensions-dir=${profile.extensions}`,
    `--extensionDevelopmentPath=${extension}`,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    projectFolder(document),
    document,
  ];
  const started = now();
  // One command line, so that `code.cmd` runs through the shell on Windows as elsewhere.
  const child = spawn([code, ...args].map(quote).join(' '), {
    shell: true,
    stdio: 'ignore',
    env: { ...process.env, ...env },
  });
  const exited = await new Promise((done) => {
    const timer = setTimeout(() => done(false), timeoutMs);
    child.on('exit', () => {
      clearTimeout(timer);
      done(true);
    });
  });
  if (!exited) {
    throw new Error(`VS Code did not quit within ${String(timeoutMs / 1000)} s; close it.`);
  }
  return started;
}

/** The machine, VS Code version and commit, to keep with the results. */
export function machine(code) {
  const run = (command, args, options) => {
    try {
      return execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
    } catch {
      return 'unknown';
    }
  };
  return {
    cpu: cpus()[0]?.model.trim() ?? 'unknown',
    memoryGb: Math.round(totalmem() / 2 ** 30),
    os: `${platform()} ${release()}`,
    vscode: run([code, '--version'].map(quote).join(' '), [], { shell: true }).split('\n')[0],
    commit: run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }),
  };
}

export const describeMachine = (about) =>
  `${about.cpu}, ${String(about.memoryGb)} GB, ${about.os}, VS Code ${about.vscode}, commit ${about.commit}`;
