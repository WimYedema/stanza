import type { DirectoryEntry, ProjectStorage } from '@stanza/project';

/** What the storage needs from a file system. Paths are relative to the project root, with `/`. */
export interface FileIo {
  read(path: string): Promise<Uint8Array>;
  list(directory: string): Promise<readonly DirectoryEntry[]>;
  write(path: string, content: Uint8Array): Promise<void>;
  /** The text of the file if the editor has it open, which may be newer than the file. */
  openText(path: string): string | undefined;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

/** The storage of a project (ADR 0014) over a file system, which prefers what is open. */
export function projectStorage(io: FileIo): ProjectStorage {
  return {
    readText: async (path) => io.openText(path) ?? decoder.decode(await io.read(path)),
    readBytes: (path) => io.read(path),
    list: (directory) => io.list(directory),
    writeFile: (path, content) => io.write(path, content),
    writeText: (path, text) => io.write(path, encoder.encode(text)),
  };
}
