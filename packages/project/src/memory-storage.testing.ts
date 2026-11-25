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

/**
 * A project in memory. Paths in `unreadable` exist but fail to read. Binary files, such as images,
 * are in `binary`; `readBytes` of a text file gives its UTF-8 bytes.
 */
export function memoryStorage(
  files: Readonly<Record<string, string>>,
  unreadable: readonly string[] = [],
  binary: Readonly<Record<string, Uint8Array>> = {},
): MemoryStorage {
  const reads: string[] = [];
  const written = new Map<string, Uint8Array>();
  const texts = new Map<string, string>();
  const paths = [...Object.keys(files), ...Object.keys(binary)];
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
    readBytes(path): Promise<Uint8Array> {
      reads.push(path);
      const bytes = binary[path];
      const text = files[path];
      if (unreadable.includes(path) || (bytes === undefined && text === undefined)) {
        return Promise.reject(new Error(`ENOENT: ${path}`));
      }
      return Promise.resolve(bytes ?? new TextEncoder().encode(text));
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

/** A project on disk, as the text files and the binary files of `memoryStorage`. */
export interface DiskProject {
  readonly files: Record<string, string>;
  readonly binary: Record<string, Uint8Array>;
}

const BINARY = /\.(png|jpe?g|docx)$/i;

/** The files of a project directory, by relative path. A build it left behind is skipped. */
export function diskProject(root: string): DiskProject {
  const files: Record<string, string> = {};
  const binary: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (path.startsWith('build/')) continue;
    if (BINARY.test(path)) binary[path] = new Uint8Array(readFileSync(absolute));
    else files[path] = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
  }
  return { files, binary };
}

/** The directories under `examples/`, each a project (examples/README.md). */
export function exampleNames(): readonly string[] {
  const root = fileURLToPath(new URL('../../../examples/', import.meta.url));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** One project of `examples/`. */
export function exampleDirectory(name: string): string {
  return fileURLToPath(new URL(`../../../examples/${name}/`, import.meta.url));
}

/** The files of `fixtures/example-project`, by relative path. */
export function exampleProject(): Record<string, string> {
  return diskProject(fileURLToPath(new URL('../../../fixtures/example-project/', import.meta.url)))
    .files;
}
