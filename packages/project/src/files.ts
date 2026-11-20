import type { ProjectDiagnostic } from './diagnostics.js';
import type { ProjectStorage } from './storage.js';

export const PROJECT_FILE = 'stanza.yaml';
export const DOCUMENT_SUFFIX = '.stanza.md';

/** The text of a file, or a `file-unreadable` diagnostic in its place. */
export async function readText(
  storage: ProjectStorage,
  file: string,
  diagnostics: ProjectDiagnostic[],
): Promise<string | undefined> {
  try {
    return await storage.readText(file);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    diagnostics.push({
      file,
      severity: 'error',
      code: 'file-unreadable',
      message: `Cannot read the file: ${reason}`,
    });
    return undefined;
  }
}

/** Hidden directories and `node_modules` hold no documents. */
const skipped = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

async function walk(storage: ProjectStorage, directory: string, found: string[]): Promise<void> {
  for (const entry of await storage.list(directory)) {
    if (skipped(entry.name)) continue;
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
    if (entry.directory) await walk(storage, path, found);
    else if (entry.name.endsWith(DOCUMENT_SUFFIX)) found.push(path);
  }
}

/** The paths of all documents below the project root, sorted. */
export async function findDocuments(storage: ProjectStorage): Promise<readonly string[]> {
  const found: string[] = [];
  await walk(storage, '', found);
  return found.sort();
}
