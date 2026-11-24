import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { PUSH_REVIEW_COMMAND, registerPushReview } from './push-review-command.js';
import { FakeUri, reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `stanza-format: 1
title: 'Project'
stylesheet: 'styles/default.yaml'
`;
const STYLESHEET = `stanza-format: 1
paragraph-styles:
  body: {}
  heading-1: {}
  heading-2: {}
  heading-3: {}
  heading-4: {}
  heading-5: {}
  heading-6: {}
  code: {}
  list-bulleted: {}
  list-numbered: {}
table-styles:
  table: {}
`;
const DOCUMENT = '/w/p/documents/one.stanza.md';
const FIRST = `---\nstanza-format: 1\ntitle: "T"\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const FOLDER = '/w/review';
const PUSHED = `${FOLDER}/one.docx`;

/** A Memento in memory, as the workspace state of the extension. */
function memento(): vscode.Memento & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? (values.get(key) as T) : fallback),
    update: (key: string, value: unknown) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
}

let state: ReturnType<typeof memento>;

async function run(): Promise<void> {
  registerPushReview(state);
  const handler = world.commandHandlers.get(PUSH_REVIEW_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  // As the editor passes its document; the palette uses the editor in front.
  await (handler as (target?: vscode.Uri) => Promise<void>)(
    new FakeUri(DOCUMENT) as unknown as vscode.Uri,
  );
}

/** The pushed file as Word leaves it after a save: only the modified time changes. */
function saveInWord(): void {
  const files = unzipSync(world.binary.get(PUSHED) ?? new Uint8Array());
  const core = strFromU8(files['docProps/core.xml'] ?? new Uint8Array());
  files['docProps/core.xml'] = strToU8(
    core.replace(
      /(<dcterms:modified\b[^>]*>)[^<]*/,
      (_match, open: string) => `${open}2026-11-24T17:37:00Z`,
    ),
  );
  world.binary.set(PUSHED, zipSync(files));
}

beforeEach(() => {
  reset(
    {
      '/w/p/stanza.yaml': PROJECT,
      '/w/p/styles/default.yaml': STYLESHEET,
      [DOCUMENT]: FIRST,
      [`${FOLDER}/notes.txt`]: 'A folder that exists.',
    },
    DOCUMENT,
    FIRST,
  );
  world.dialogFolder = FOLDER;
  state = memento();
});

describe('Stanza: Push for Review (ADR 0088)', () => {
  it('writes the document to the folder, remembers it, and replaces the file next time', async () => {
    await run();
    expect(world.errors).toEqual([]);
    expect(world.binary.get(PUSHED)?.length).toBeGreaterThan(0);
    expect([...state.values.values()]).toEqual([`file://${FOLDER}`]);
    expect(world.infos.at(-1)).toMatch(/^Stanza: wrote .*one\.docx for review\.$/);
    await run();
    expect(world.infos.at(-1)).toMatch(/^Stanza: replaced .*one\.docx for review\.$/);
  });

  it('asks before replacing a file that was saved in Word and not pulled', async () => {
    await run();
    saveInWord();
    const saved = world.binary.get(PUSHED);
    world.warningChoice = undefined;
    await run();
    expect(world.warnings.at(-1)).toContain('was saved in Word on 2026-11-24 17:37 UTC');
    expect(world.binary.get(PUSHED)).toBe(saved);

    world.warningChoice = 'Write a New File';
    await run();
    const fresh = [...world.binary.keys()].find((path) =>
      /\/one-\d{4}-\d{2}-\d{2}\.docx$/.test(path),
    );
    expect(fresh).toBeDefined();
    expect(world.binary.get(PUSHED)).toBe(saved);

    world.warningChoice = 'Replace Anyway';
    await run();
    expect(world.binary.get(PUSHED)).not.toBe(saved);
    expect(world.errors).toEqual([]);
  });

  it('pushes nothing when the folder is not chosen', async () => {
    world.dialogFolder = undefined;
    await run();
    expect(world.binary.has(PUSHED)).toBe(false);
    expect(world.errors).toEqual([]);
  });
});
