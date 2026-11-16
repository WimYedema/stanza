import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { PhraseTree } from './phrase-tree.js';
import { changeDocument, FakeUri, reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const ROOT = new FakeUri('/w/p') as unknown as vscode.Uri;
const SOURCE = '/w/p/documents/one.phrase.md';
const TARGET = '/w/p/documents/two.phrase.md';
const FRONT = '---\nphrase-format: 1\n---\n\n';
const ONE = `${FRONT}<!-- phrase: #aaaaaaaaaa -->\n# One\n`;
const TWO = `${FRONT}<!-- phrase: #bbbbbbbbbb -->\n# Two\n`;
const STYLESHEET = readFileSync(
  new URL('../../../../fixtures/example-project/styles/default.yaml', import.meta.url),
  'utf8',
);
let diagnostics: ProjectDiagnostics;

beforeEach(() => {
  reset(
    {
      '/w/p/phrase.yaml': 'phrase-format: 1\ntitle: P\nstylesheet: styles/default.yaml\n',
      '/w/p/styles/default.yaml': STYLESHEET,
      [SOURCE]: ONE,
      [TARGET]: TWO,
    },
    SOURCE,
    ONE,
  );
  diagnostics = new ProjectDiagnostics();
});
afterEach(() => {
  diagnostics.dispose();
  vi.restoreAllMocks();
});

describe('shared project snapshots', () => {
  it('coalesces concurrent loads and reuses the same snapshot in the project tree', async () => {
    const read = vi.spyOn(vscode.workspace.fs, 'readFile');
    const [first, second, third] = await Promise.all([
      diagnostics.load(ROOT),
      diagnostics.load(ROOT),
      diagnostics.load(ROOT),
    ]);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(read.mock.calls.filter(([uri]) => uri.path === TARGET)).toHaveLength(1);
    const count = read.mock.calls.length;
    expect(await diagnostics.load(ROOT)).toBe(first);
    const tree = new PhraseTree(diagnostics);
    await tree.getChildren();
    tree.dispose();
    expect(read).toHaveBeenCalledTimes(count);
  });

  it('invalidates unsaved changes and closing buffers rather than returning stale IDs', async () => {
    const before = await diagnostics.load(ROOT);
    changeDocument(ONE.replace('aaaaaaaaaa', 'cccccccccc'));
    expect(diagnostics.current(ROOT)).toBeUndefined();
    const after = await diagnostics.load(ROOT);
    expect(after).not.toBe(before);
    expect(
      after.documents.find((document) => document.path === 'documents/one.phrase.md')?.document
        .blocks[0]?.id,
    ).toBe('cccccccccc');
    for (const listener of world.closeListeners) listener(world.document as never);
    expect(diagnostics.current(ROOT)).toBeUndefined();
  });

  it('keeps warm snapshots when a clean document opens, but invalidates a restored dirty buffer', async () => {
    const snapshot = await diagnostics.load(ROOT);
    for (const listener of world.openListeners)
      listener({ ...world.document, isDirty: false } as never);
    expect(diagnostics.current(ROOT)).toBe(snapshot);
    for (const listener of world.openListeners)
      listener({ ...world.document, isDirty: true } as never);
    expect(diagnostics.current(ROOT)).toBeUndefined();
  });

  it.each(['change', 'create', 'delete'] as const)(
    'invalidates filesystem %s events',
    async (event) => {
      await diagnostics.load(ROOT);
      const watcher = world.fileWatchers[0];
      if (watcher === undefined) throw new Error('No snapshot watcher was installed.');
      if (event === 'create') world.files.set('/w/p/new.phrase.md', `${FRONT}New\n`);
      if (event === 'delete') world.files.delete(TARGET);
      if (event === 'change') world.files.set('/w/p/phrase.yaml', 'phrase-format: 1\n');
      for (const listener of watcher[event]) listener(new FakeUri(TARGET));
      expect(diagnostics.current(ROOT)).toBeUndefined();
      const loaded = await diagnostics.load(ROOT);
      if (event === 'create')
        expect(loaded.documents.some((entry) => entry.path === 'new.phrase.md')).toBe(true);
      if (event === 'delete')
        expect(loaded.documents.some((entry) => entry.path === 'documents/two.phrase.md')).toBe(
          false,
        );
      if (event === 'change') expect(loaded.settings).toBeUndefined();
    },
  );

  it('discards an invalidated in-flight result and gives every caller the newer snapshot', async () => {
    const read = vscode.workspace.fs.readFile.bind(vscode.workspace.fs);
    let release = (): void => {
      throw new Error('The load is not blocked.');
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = true;
    const spy = vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async (uri) => {
      const bytes = await read(uri);
      if (uri.path === TARGET && waiting) {
        waiting = false;
        await gate;
      }
      return bytes;
    });
    const first = diagnostics.load(ROOT);
    await vi.waitFor(() => {
      expect(spy.mock.calls.some(([uri]) => uri.path === TARGET)).toBe(true);
    });
    world.files.set(TARGET, TWO.replace('bbbbbbbbbb', 'dddddddddd'));
    const latest = await diagnostics.refresh(ROOT);
    release();
    expect(await first).toBe(latest);
    expect(diagnostics.current(ROOT)).toBe(latest);
    expect(
      latest.documents.find((document) => document.path === 'documents/two.phrase.md')?.document
        .blocks[0]?.id,
    ).toBe('dddddddddd');
  });

  it('surfaces load failures and allows a later retry', async () => {
    vi.spyOn(vscode.workspace.fs, 'readDirectory').mockRejectedValueOnce(
      new Error('Cannot list project'),
    );
    await expect(diagnostics.load(ROOT)).rejects.toThrow('Cannot list project');
    expect(diagnostics.current(ROOT)).toBeUndefined();
    expect((await diagnostics.load(ROOT)).documents).toHaveLength(2);
  });
});
