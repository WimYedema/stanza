import { describe, expect, it } from 'vitest';
import { changedPaths, gitRevisions, type RunGit } from './git-revisions.js';

/** A Git that answers each command from a table, and fails for anything else. */
function fakeGit(answers: Readonly<Record<string, string | undefined>>): RunGit {
  return (_cwd, args) => Promise.resolve(answers[args.join(' ')]);
}

const COMMIT = '5f7f366e19d69c26fd4fda1e2fc08e0747b883b1';
const answers: Readonly<Record<string, string | undefined>> = {
  'rev-parse --show-prefix': 'docs/\n',
  'rev-parse --verify HEAD': `${COMMIT}\n`,
  'ls-files -z --full-name -- .':
    'docs/stanza.yaml\0docs/documents/a.stanza.md\0docs/documents/b.stanza.md\0',
  'status --porcelain=v1 -z --untracked-files=all -- .':
    ' M docs/documents/b.stanza.md\0?? docs/documents/c.stanza.md\0',
};

describe('gitRevisions', () => {
  it('gives the commit of HEAD, and marks changed and untracked documents dirty', async () => {
    const revisions = await gitRevisions(
      '/repo/docs',
      fakeGit(answers),
    )(['documents/a.stanza.md', 'documents/b.stanza.md', 'documents/c.stanza.md']);
    expect(Object.fromEntries(revisions)).toEqual({
      'documents/a.stanza.md': { commit: COMMIT, dirty: false },
      'documents/b.stanza.md': { commit: COMMIT, dirty: true },
      'documents/c.stanza.md': { commit: COMMIT, dirty: true },
    });
  });

  it('gives nothing outside a repository or without a commit', async () => {
    const outside = { ...answers, 'rev-parse --show-prefix': undefined };
    expect((await gitRevisions('/x', fakeGit(outside))(['a.stanza.md'])).size).toBe(0);
    const empty = { ...answers, 'rev-parse --verify HEAD': undefined };
    expect((await gitRevisions('/x', fakeGit(empty))(['a.stanza.md'])).size).toBe(0);
  });
});

describe('changedPaths', () => {
  it('takes both paths of a rename', () => {
    expect([...changedPaths('R  new.stanza.md\0old.stanza.md\0 M other.md\0')]).toEqual([
      'new.stanza.md',
      'old.stanza.md',
      'other.md',
    ]);
  });
});
