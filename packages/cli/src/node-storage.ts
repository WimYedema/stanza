import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isSafeRelativePath } from '@stanza/core';
import type { DirectoryEntry, ProjectStorage } from '@stanza/project';

/** Paths come from project files and document names, so none may leave the root. */
function locator(root: string): (path: string) => string {
  const base = resolve(root);
  return (path) => {
    if (path !== '' && !isSafeRelativePath(path)) throw new Error(`Unsafe path "${path}".`);
    return join(base, ...path.split('/'));
  };
}

/** Removes one file below the root; only `stanza migrate` removes files (ADR 0083). */
export function nodeRemove(root: string): (path: string) => Promise<void> {
  const locate = locator(root);
  return (path) => unlink(locate(path));
}

/** The project storage on the Node filesystem, rooted at one directory. */
export function nodeStorage(root: string): ProjectStorage {
  const locate = locator(root);
  return {
    readText: async (path) => readFile(locate(path), 'utf8'),
    async list(directory): Promise<readonly DirectoryEntry[]> {
      const entries = await readdir(locate(directory), { withFileTypes: true });
      // Links and special files are left out, which also keeps a link loop from being followed.
      return entries
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
    },
    async writeFile(path, content): Promise<void> {
      const file = locate(path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    },
    async writeText(path, text): Promise<void> {
      const file = locate(path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text, 'utf8');
    },
  };
}
