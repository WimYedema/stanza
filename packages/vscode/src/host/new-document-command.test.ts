import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { NEW_DOCUMENT_COMMAND, registerNewDocument } from './new-document-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `stanza-format: 1
title: 'Project'
stylesheet: 'styles/default.yaml'
`;
const DOCUMENT = '/w/p/documents/one.stanza.md';
const NEW_DOCUMENT = '/w/p/documents/meeting-notes.stanza.md';

async function run(): Promise<void> {
  registerNewDocument();
  const handler = world.commandHandlers.get(NEW_DOCUMENT_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

beforeEach(() => {
  reset(
    {
      '/w/p/stanza.yaml': PROJECT,
      '/w/p/styles/default.yaml': 'stanza-format: 1\n',
      [DOCUMENT]: '---\nstanza-format: 1\n---\n',
    },
    DOCUMENT,
    '',
  );
  world.inputValue = 'Meeting Notes';
});

describe('Stanza: New Document', () => {
  it('adds a document to the project of the editor in front and opens it in the Stanza editor', async () => {
    world.activeTab = {
      input: new vscode.TabInputCustom(vscode.Uri.file(DOCUMENT), 'stanza.editor'),
    };
    await run();
    expect(world.files.get(NEW_DOCUMENT)).toContain('# Meeting Notes');
    const [uri, viewType] = world.commandArgs[0] ?? [];
    expect((uri as { path: string }).path).toBe(NEW_DOCUMENT);
    expect(viewType).toBe('stanza.editor');
    expect(world.errors).toEqual([]);
  });

  it('starts from the only project of the workspace when no file is in front', async () => {
    await run();
    expect(world.files.has(NEW_DOCUMENT)).toBe(true);
  });

  it('wants a title, and does nothing when none is given', async () => {
    world.inputValue = undefined;
    await run();
    expect(world.inputOptions?.validateInput?.(' ')).toBe('A title is needed.');
    expect(world.files.has(NEW_DOCUMENT)).toBe(false);
    expect(world.commands).toEqual([]);
  });

  it('writes nothing and says why when a document of that name exists', async () => {
    world.files.set(NEW_DOCUMENT, 'mine');
    await run();
    expect(world.files.get(NEW_DOCUMENT)).toBe('mine');
    expect(world.errors[0]).toContain('exists already');
    expect(world.commands).toEqual([]);
  });

  it('says so when there is no project', async () => {
    reset({}, DOCUMENT, '');
    await run();
    expect(world.errors).toEqual([expect.stringContaining('there is no project here')]);
  });

  it('says so when the file cannot be written', async () => {
    world.failWrites = true;
    await run();
    expect(world.errors[0]).toContain('could not be written');
    expect(world.commands).toEqual([]);
  });
});
