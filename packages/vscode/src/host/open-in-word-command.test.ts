import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ExportOnSave } from './export-on-save.js';
import { OPEN_IN_WORD_COMMAND, registerOpenInWord } from './open-in-word-command.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { reset, world } from './vscode-fake.testing.js';

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
const FRONT = '---\nstanza-format: 1\ntitle: "T"\n---\n\n';
const GOOD = `${FRONT}<!-- stanza: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const BAD = `${FRONT}<!-- stanza: .missing -->\nText\n`;

const DOCUMENT = '/w/p/documents/one.stanza.md';
const OUTPUT = '/w/p/build/documents/one.docx';
const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;

function open(openText = GOOD, project = true): void {
  reset(
    {
      ...(project ? { '/w/p/stanza.yaml': PROJECT, '/w/p/styles/default.yaml': STYLESHEET } : {}),
      [DOCUMENT]: GOOD,
    },
    DOCUMENT,
    openText,
  );
  registerOpenInWord(new ExportOnSave(new ProjectDiagnostics(), log));
}

async function run(target?: vscode.Uri): Promise<void> {
  const handler = world.commandHandlers.get(OPEN_IN_WORD_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as (target?: vscode.Uri) => Promise<void>)(target);
}

const documentUri = (): vscode.Uri => vscode.Uri.file(DOCUMENT);

beforeEach(() => {
  open();
});

describe('Stanza: Open in Word', () => {
  it('exports the document that the title bar passes and opens its DOCX', async () => {
    await run(documentUri());
    expect(world.files.has(OUTPUT)).toBe(true);
    expect(world.opened).toEqual([OUTPUT]);
  });

  it('uses the editor in front when the palette runs it', async () => {
    world.activeTab = { input: new vscode.TabInputCustom(documentUri(), 'stanza.editor') };
    await run();
    expect(world.opened).toEqual([OUTPUT]);
  });

  it('exports the text as it is open, not the file on disk', async () => {
    open(BAD);
    await run(documentUri());
    expect(world.files.has(OUTPUT)).toBe(false);
    expect(world.opened).toEqual([]);
    expect(world.status[0]).toContain('not exported');
  });

  it('does not open a DOCX that could not be written, as when Word has it open', async () => {
    world.failWrites = true;
    await run(documentUri());
    expect(world.errors[0]).toContain('open in Word');
    expect(world.opened).toEqual([]);
  });

  it('says so when the system cannot open the file', async () => {
    world.failOpen = true;
    await run(documentUri());
    expect(world.errors).toEqual([expect.stringContaining('could not be opened')]);
  });

  it('is for a local window only', async () => {
    world.remoteName = 'ssh-remote';
    await run(documentUri());
    expect(world.errors).toEqual([expect.stringContaining('local VS Code window')]);
    expect(world.files.has(OUTPUT)).toBe(false);
  });

  it('asks for a Stanza document when there is none in front', async () => {
    await run();
    expect(world.errors).toEqual([expect.stringContaining('open a Stanza document')]);
  });

  it('says so when the document is not in a project', async () => {
    open(GOOD, false);
    await run(documentUri());
    expect(world.errors).toEqual([expect.stringContaining('not in a project')]);
    expect(world.opened).toEqual([]);
  });
});
