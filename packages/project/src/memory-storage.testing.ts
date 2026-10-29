import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DirectoryEntry, ProjectStorage } from './storage.js';

/** Helpers for tests that need a project. Not part of the package. */

export interface MemoryStorage extends ProjectStorage {
  /** Every path that was asked for with `readText`, in order. */
  readonly reads: string[];
  /** Everything written, by path. */
  readonly written: Map<string, Uint8Array>;
  /** Text files written, by path. */
  readonly texts: Map<string, string>;
}

/** A project in memory. Paths in `unreadable` exist but fail to read. */
export function memoryStorage(
  files: Readonly<Record<string, string>>,
  unreadable: readonly string[] = [],
): MemoryStorage {
  const reads: string[] = [];
  const written = new Map<string, Uint8Array>();
  const texts = new Map<string, string>();
  const paths = Object.keys(files);
  return {
    reads,
    written,
    texts,
    readText(path): Promise<string> {
      reads.push(path);
      const text = files[path];
      if (text === undefined || unreadable.includes(path)) {
        return Promise.reject(new Error(`ENOENT: ${path}`));
      }
      return Promise.resolve(text);
    },
    list(directory): Promise<readonly DirectoryEntry[]> {
      const prefix = directory === '' ? '' : `${directory}/`;
      const entries = new Map<string, boolean>();
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue;
        const [name = '', ...rest] = path.slice(prefix.length).split('/');
        entries.set(name, rest.length > 0);
      }
      return Promise.resolve(
        [...entries].map(([name, isDirectory]) => ({ name, directory: isDirectory })),
      );
    },
    writeFile(path, content): Promise<void> {
      written.set(path, content);
      return Promise.resolve();
    },
    writeText(path, text): Promise<void> {
      texts.set(path, text);
      return Promise.resolve();
    },
  };
}

/** The files of `fixtures/example-project`, by relative path. */
export function exampleProject(): Record<string, string> {
  const root = fileURLToPath(new URL('../../../fixtures/example-project/', import.meta.url));
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    // A build of the fixture may have left output behind.
    if (path.startsWith('build/')) continue;
    files[path] = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
  }
  return files;
}
