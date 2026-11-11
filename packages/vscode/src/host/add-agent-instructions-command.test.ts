import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { AGENT_INSTRUCTIONS } from '@phrase/project';
import {
  ADD_AGENT_INSTRUCTIONS_COMMAND,
  registerAddAgentInstructions,
} from './add-agent-instructions-command.js';
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
const TEXT = '---\nphrase-format: 1\ntitle: "T"\n---\n\nText.\n';

async function run(): Promise<void> {
  const handler = world.commandHandlers.get(ADD_AGENT_INSTRUCTIONS_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

function open(extra: Record<string, string> = {}): void {
  reset({ '/w/p/phrase.yaml': PROJECT, [DOCUMENT]: TEXT, ...extra }, DOCUMENT, TEXT);
  world.activeTab = {
    input: new vscode.TabInputCustom(vscode.Uri.file(DOCUMENT), 'phrase.editor'),
  };
  registerAddAgentInstructions();
}

beforeEach(() => {
  open();
});

describe('Phrase: Add Agent Instructions', () => {
  it('writes AGENTS.md into the project of the document in front, and opens it', async () => {
    await run();
    expect(world.files.get('/w/p/AGENTS.md')).toBe(AGENT_INSTRUCTIONS);
    expect(world.commands).toEqual(['vscode.open']);
    expect((world.commandArgs[0]?.[0] as { path: string }).path).toBe('/w/p/AGENTS.md');
    expect(world.errors).toEqual([]);
  });

  it('does not change a file that is there, and says so', async () => {
    open({ '/w/p/AGENTS.md': 'My own rules.\n' });
    await run();
    expect(world.files.get('/w/p/AGENTS.md')).toBe('My own rules.\n');
    expect(world.infos).toEqual([expect.stringContaining('AGENTS.md already')]);
    expect(world.commands).toEqual([]);
  });

  it('says so when there is no project', async () => {
    reset({}, DOCUMENT, TEXT);
    registerAddAgentInstructions();
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
