import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { vscodeGitRevisions } from './git-revisions.js';

/** The Git extension that the fake VS Code offers, set by each test. */
const git: { extension: unknown } = { extension: undefined };

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return {
    ...fake.createFakeVscode(),
    extensions: { getExtension: (id: string) => (id === 'vscode.git' ? git.extension : undefined) },
  };
});

const ROOT = vscode.Uri.file('/w/p');
const inProject = (path: string): vscode.Uri => vscode.Uri.joinPath(ROOT, ...path.split('/'));
const change = (path: string) => ({ uri: inProject(path), originalUri: inProject(path) });

function withRepository(state: object, refreshed: string[] = []): void {
  const repository = {
    state,
    status: () => {
      refreshed.push('status');
      return Promise.resolve();
    },
  };
  git.extension = {
    isActive: true,
    exports: { getAPI: () => ({ getRepository: () => repository }) },
  };
}

describe('vscodeGitRevisions', () => {
  it('refreshes the status, then gives the commit and marks changed and untracked documents dirty', async () => {
    const refreshed: string[] = [];
    withRepository(
      {
        HEAD: { commit: 'abc123' },
        workingTreeChanges: [change('documents/b.stanza.md')],
        indexChanges: [],
        untrackedChanges: [change('documents/c.stanza.md')],
      },
      refreshed,
    );
    const revisions = await vscodeGitRevisions(ROOT)([
      'documents/a.stanza.md',
      'documents/b.stanza.md',
      'documents/c.stanza.md',
    ]);
    expect(refreshed).toEqual(['status']);
    expect(Object.fromEntries(revisions)).toEqual({
      'documents/a.stanza.md': { commit: 'abc123', dirty: false },
      'documents/b.stanza.md': { commit: 'abc123', dirty: true },
      'documents/c.stanza.md': { commit: 'abc123', dirty: true },
    });
  });

  it('gives nothing without the Git extension, a repository or a commit', async () => {
    git.extension = undefined;
    expect((await vscodeGitRevisions(ROOT)(['a.stanza.md'])).size).toBe(0);
    git.extension = {
      isActive: true,
      exports: { getAPI: () => ({ getRepository: () => null }) },
    };
    expect((await vscodeGitRevisions(ROOT)(['a.stanza.md'])).size).toBe(0);
    withRepository({ workingTreeChanges: [], indexChanges: [] });
    expect((await vscodeGitRevisions(ROOT)(['a.stanza.md'])).size).toBe(0);
  });
});
