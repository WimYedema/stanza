import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ADOPT_MARKDOWN_COMMAND, registerAdoptMarkdown } from './adopt-markdown-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `phrase-format: 1
title: 'Project'
stylesheet: 'styles/default.yaml'
`;
const STYLESHEET = `phrase-format: 1
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
const DOCUMENT = '/w/p/documents/one.phrase.md';
const FIRST = `---\nphrase-format: 1\ntitle: "T"\n---\n\n<!-- phrase: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const MARKDOWN_FILE = '/w/docs/Meeting notes.md';
const NEW_DOCUMENT = '/w/p/documents/meeting-notes.phrase.md';
const MARKDOWN = '# Scope\n\nSome text.\n\n> quoted\n';

let lines: string[];
let shown: number;
const log = {
  appendLine: (line: string) => lines.push(line),
  show: () => (shown += 1),
} as unknown as vscode.OutputChannel;

async function run(): Promise<void> {
  registerAdoptMarkdown(log);
  const handler = world.commandHandlers.get(ADOPT_MARKDOWN_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

beforeEach(() => {
  lines = [];
  shown = 0;
  reset(
    {
      '/w/p/phrase.yaml': PROJECT,
      '/w/p/styles/default.yaml': STYLESHEET,
      [DOCUMENT]: FIRST,
    },
    DOCUMENT,
    FIRST,
  );
  world.binary.set(MARKDOWN_FILE, new TextEncoder().encode(MARKDOWN));
  world.dialogFolder = MARKDOWN_FILE;
});

describe('Phrase: Adopt Markdown File', () => {
  it('adds the Markdown as a new document and opens it in the Phrase editor', async () => {
    await run();
    expect(world.files.get(NEW_DOCUMENT)).toContain('# Scope');
    expect(world.commands).toEqual(['vscode.openWith']);
    const [uri, viewType] = world.commandArgs[0] ?? [];
    expect((uri as { path: string }).path).toBe(NEW_DOCUMENT);
    expect(viewType).toBe('phrase.editor');
    expect(world.errors).toEqual([]);
  });

  it('writes the report to the Phrase output, and shows it on request', async () => {
    world.infoChoice = 'Show report';
    await run();
    expect(lines[0]).toBe('Adopted Meeting notes.md as documents/meeting-notes.phrase.md.');
    expect(lines.some((line) => line.includes('Block quotes were written'))).toBe(true);
    expect(world.infos[0]).toContain('documents/meeting-notes.phrase.md');
    expect(shown).toBe(1);
  });

  it('does nothing when no file is picked', async () => {
    world.dialogFolder = undefined;
    await run();
    expect(world.files.has(NEW_DOCUMENT)).toBe(false);
    expect(world.commands).toEqual([]);
  });

  it('says so and writes nothing when the file is a Phrase document already', async () => {
    world.binary.set(
      MARKDOWN_FILE,
      new TextEncoder().encode('---\nphrase-format: 1\ntitle: T\n---\n\nText\n'),
    );
    await run();
    expect(world.errors[0]).toContain('nothing was adopted');
    expect(world.errors[0]).toContain('is a Phrase document');
    expect(world.files.has(NEW_DOCUMENT)).toBe(false);
  });

  it('says so when there is no project', async () => {
    reset({}, DOCUMENT, '');
    await run();
    expect(world.errors).toEqual([expect.stringContaining('there is no project here')]);
  });

  it('says so when the file cannot be written', async () => {
    world.failWrites = true;
    await run();
    expect(world.errors[0]).toContain('the adoption failed');
    expect(world.commands).toEqual([]);
  });
});
