import * as vscode from 'vscode';
import type { SourceRevision } from '@stanza/core';
import type { SourceRevisions } from '@stanza/project';
import { uriInProject } from './project-files.js';

/** The part of the API of VS Code's built-in Git extension (`vscode.git`, version 1) used here. */
interface GitChange {
  readonly uri: vscode.Uri;
  readonly originalUri: vscode.Uri;
}
interface GitRepository {
  readonly state: {
    readonly HEAD?: { readonly commit?: string };
    readonly workingTreeChanges: readonly GitChange[];
    readonly indexChanges: readonly GitChange[];
    readonly untrackedChanges?: readonly GitChange[];
  };
  status(): Promise<void>;
}
interface GitApi {
  getRepository(uri: vscode.Uri): GitRepository | null;
}
interface GitExtension {
  getAPI(version: 1): GitApi;
}

async function gitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (extension === undefined) return undefined;
  const exports = extension.isActive ? extension.exports : await extension.activate();
  return exports.getAPI(1);
}

/**
 * The revisions of documents from VS Code's Git, for the revision stamp (ADR 0084), so that the
 * stamp works wherever the Git of the window does, in a remote window too (ADR 0002). The status
 * is refreshed first, since a document that was just saved may not be in it yet. A document is
 * dirty when it has changes in the index or the working tree, or is untracked. An ignored document
 * is not seen as dirty; the content hash of the stamp still tells it apart from the commit.
 */
export function vscodeGitRevisions(root: vscode.Uri): SourceRevisions {
  return async (paths) => {
    const revisions = new Map<string, SourceRevision>();
    const api = await gitApi();
    const repository = api?.getRepository(root) ?? undefined;
    if (repository === undefined) return revisions;
    await repository.status();
    const commit = repository.state.HEAD?.commit;
    if (commit === undefined) return revisions;
    const { workingTreeChanges, indexChanges, untrackedChanges = [] } = repository.state;
    const changed = new Set(
      [...workingTreeChanges, ...indexChanges, ...untrackedChanges].flatMap((change) => [
        change.uri.toString(),
        change.originalUri.toString(),
      ]),
    );
    for (const path of paths) {
      revisions.set(path, { commit, dirty: changed.has(uriInProject(root, path).toString()) });
    }
    return revisions;
  };
}
