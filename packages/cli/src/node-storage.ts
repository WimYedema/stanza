import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isSafeRelativePath } from '@phrase/core';
import type { DirectoryEntry, ProjectStorage } from '@phrase/project';

/** The project storage on the Node filesystem, rooted at one directory. */
export function nodeStorage(root: string): ProjectStorage {
  const base = resolve(root);
  // Paths come from project files and document names, so none may leave the root.
  const locate = (path: string): string => {
    if (path !== '' && !isSafeRelativePath(path)) throw new Error(`Unsafe path "${path}".`);
    return join(base, ...path.split('/'));
  };
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
  };
}
