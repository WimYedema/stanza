import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { EDIT_STYLES_COMMAND, registerEditStyles } from './edit-styles-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `phrase-format: 1
title: 'Project'
stylesheet: 'styles/default.yaml'
`;
const DOCUMENT = '/w/p/documents/one.phrase.md';

const files = (extra: Record<string, string> = {}): Record<string, string> => ({
  '/w/p/phrase.yaml': PROJECT,
  '/w/p/styles/default.yaml': 'phrase-format: 1\n',
  [DOCUMENT]: '---\nphrase-format: 1\n---\n',
  ...extra,
});

async function run(): Promise<void> {
  registerEditStyles();
  const handler = world.commandHandlers.get(EDIT_STYLES_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

beforeEach(() => {
  reset(files(), DOCUMENT, '');
});

describe('Phrase: Edit Styles', () => {
  it('opens the stylesheet of the project of the editor in front, in the style editor', async () => {
    world.activeTab = {
      input: new vscode.TabInputCustom(vscode.Uri.file(DOCUMENT), 'phrase.editor'),
    };
    await run();
    expect(world.commands).toEqual(['vscode.openWith']);
    const [uri, viewType] = world.commandArgs[0] ?? [];
    expect((uri as { path: string }).path).toBe('/w/p/styles/default.yaml');
    expect(viewType).toBe('phrase.styles');
  });

  it('works from a text editor too', async () => {
    world.activeTab = {
      input: new vscode.TabInputText(vscode.Uri.file('/w/p/styles/default.yaml')),
    };
    await run();
    expect(world.commands).toEqual(['vscode.openWith']);
  });

  it('starts from the only project of the workspace when no file is in front', async () => {
    await run();
    expect(world.commands).toEqual(['vscode.openWith']);
    expect((world.commandArgs[0]?.[0] as { path: string }).path).toBe('/w/p/styles/default.yaml');
  });

  it('asks which project when there are several', async () => {
    reset(
      files({
        '/w/q/phrase.yaml': PROJECT,
        '/w/q/styles/default.yaml': 'phrase-format: 1\n',
      }),
      DOCUMENT,
      '',
    );
    await run();
    expect(world.commands).toEqual(['vscode.openWith']);
  });

  it('says so when there is no project', async () => {
    reset({}, DOCUMENT, '');
    await run();
    expect(world.commands).toEqual([]);
    expect(world.errors).toEqual([expect.stringContaining('there is no project here')]);
  });

  it('says what is wrong with a project that has an error', async () => {
    reset(files({ '/w/p/phrase.yaml': 'phrase-format: 1\n' }), DOCUMENT, '');
    world.activeTab = {
      input: new vscode.TabInputText(vscode.Uri.file(DOCUMENT)),
    };
    await run();
    expect(world.commands).toEqual([]);
    expect(world.errors[0]).toContain('The project has errors');
  });
});
