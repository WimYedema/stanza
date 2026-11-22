import type { SourceRevision, SourceStamp } from '@stanza/core';
import type { ProjectStorage } from './storage.js';

/**
 * Where documents of a project stand in version control, by path relative to the project root.
 * A host supplies it (Git through the command line, or through VS Code's Git), since the project
 * package knows no Git (ADR 0084). A path that the map leaves out has no known revision.
 */
export type SourceRevisions = (
  paths: readonly string[],
) => Promise<ReadonlyMap<string, SourceRevision>>;

/**
 * The stamps of documents for the exporter: the text of each as stored, and its revision when the
 * host knows it. A host that fails to tell gives no revisions rather than no build.
 */
export async function sourceStamps(
  storage: ProjectStorage,
  paths: readonly string[],
  revisions: SourceRevisions | undefined,
): Promise<ReadonlyMap<string, SourceStamp>> {
  let known: ReadonlyMap<string, SourceRevision> = new Map();
  if (revisions !== undefined) {
    try {
      known = await revisions(paths);
    } catch {
      known = new Map();
    }
  }
  const stamps = new Map<string, SourceStamp>();
  for (const path of paths) {
    const text = await storage.readText(path);
    const revision = known.get(path);
    stamps.set(path, { path, text, ...(revision !== undefined ? { revision } : {}) });
  }
  return stamps;
}
