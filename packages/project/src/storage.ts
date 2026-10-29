/** A directory entry: only files and directories, not links or special files. */
export interface DirectoryEntry {
  readonly name: string;
  readonly directory: boolean;
}

/**
 * The files of a project, as seen by the code that loads and builds it. Paths are relative to the
 * project root and use `/`; the empty path is the root. A host supplies the implementation: Node's
 * filesystem in the CLI and the extension host, a virtual filesystem in a browser.
 */
export interface ProjectStorage {
  /** The UTF-8 text of a file. Rejects when the file cannot be read. */
  readText(path: string): Promise<string>;
  /** The entries of one directory, in no particular order. */
  list(directory: string): Promise<readonly DirectoryEntry[]>;
  /** Writes a file, creating missing directories. */
  writeFile(path: string, content: Uint8Array): Promise<void>;
  /** Writes a text file as UTF-8, creating missing directories. */
  writeText(path: string, text: string): Promise<void>;
}
