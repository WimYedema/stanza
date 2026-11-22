import { execFile } from 'node:child_process';
import type { SourceRevision } from '@stanza/core';
import type { SourceRevisions } from '@stanza/project';

/** Runs Git in a directory and gives its output, or undefined when Git fails or is missing. */
export type RunGit = (cwd: string, args: readonly string[]) => Promise<string | undefined>;

const runGit: RunGit = (cwd, args) =>
  new Promise((resolve) => {
    execFile(
      'git',
      [...args],
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        resolve(error === null ? stdout : undefined);
      },
    );
  });

/** The paths in NUL-separated Git output, without the empty entry after the last NUL. */
const entries = (output: string): string[] => output.split('\0').filter((entry) => entry !== '');

/**
 * The paths that `git status --porcelain=v1 -z` names, relative to the top of the repository. A
 * rename or copy is followed by the path it came from, which is taken as well.
 */
export function changedPaths(output: string): Set<string> {
  const paths = new Set<string>();
  const items = entries(output);
  for (let i = 0; i < items.length; i++) {
    const item = items[i] ?? '';
    paths.add(item.slice(3));
    if (/^[RC]|^.[RC]/.test(item)) {
      const from = items[i + 1];
      if (from !== undefined) paths.add(from);
      i++;
    }
  }
  return paths;
}

/**
 * The revisions of documents from Git, for the revision stamp (ADR 0084): the commit of `HEAD`,
 * and a document is dirty when it is not in that commit or differs from it, in the index or in the
 * working tree. A project outside a repository, a repository without commits, or no Git at all
 * gives no revisions.
 */
export function gitRevisions(root: string, git: RunGit = runGit): SourceRevisions {
  return async (paths) => {
    const revisions = new Map<string, SourceRevision>();
    const [prefixOut, headOut] = await Promise.all([
      git(root, ['rev-parse', '--show-prefix']),
      git(root, ['rev-parse', '--verify', 'HEAD']),
    ]);
    if (prefixOut === undefined || headOut === undefined) return revisions;
    const [trackedOut, statusOut] = await Promise.all([
      git(root, ['ls-files', '-z', '--full-name', '--', '.']),
      git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.']),
    ]);
    if (trackedOut === undefined || statusOut === undefined) return revisions;
    const prefix = prefixOut.trim();
    const commit = headOut.trim();
    const tracked = new Set(entries(trackedOut));
    const changed = changedPaths(statusOut);
    for (const path of paths) {
      const inRepository = `${prefix}${path}`;
      revisions.set(path, {
        commit,
        dirty: !tracked.has(inRepository) || changed.has(inRepository),
      });
    }
    return revisions;
  };
}
