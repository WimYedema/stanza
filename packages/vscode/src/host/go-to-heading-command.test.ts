import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GO_TO_HEADING_COMMAND, registerGoToHeading } from './go-to-heading-command.js';
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
  heading-1:
    numbered: true
  heading-2:
    based-on: heading-1
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
const TEXT = `${FRONT}# One\n\nSome text.\n\n## Two\n\n# Three\n`;

const DOCUMENT = '/w/p/documents/one.stanza.md';
const documentUri = (): vscode.Uri => vscode.Uri.file(DOCUMENT);

const reveal = vi.fn<(document: vscode.Uri, block: number) => void>();

function open(text = TEXT, project = true): void {
  reset(
    {
      ...(project ? { '/w/p/stanza.yaml': PROJECT, '/w/p/styles/default.yaml': STYLESHEET } : {}),
      [DOCUMENT]: text,
    },
    DOCUMENT,
    text,
  );
  world.activeTab = { input: new vscode.TabInputCustom(documentUri(), 'stanza.editor') };
  registerGoToHeading(reveal);
}

async function run(): Promise<void> {
  const handler = world.commandHandlers.get(GO_TO_HEADING_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

const labels = (): string[] =>
  (world.quickPicks[0] as { label: string }[]).map((item) => item.label);

beforeEach(() => {
  reveal.mockReset();
  open();
});

describe('Stanza: Go to Heading', () => {
  it('lists the headings with their numbers, indented by level', async () => {
    await run();
    expect(labels()).toEqual(['1 One', '\u20031.1 Two', '2 Three']);
  });

  it('reveals the block of the heading that is picked', async () => {
    world.quickPickIndex = 1;
    await run();
    expect(reveal).toHaveBeenCalledTimes(1);
    const [uri, block] = reveal.mock.calls[0] ?? [];
    expect(uri?.path).toBe(DOCUMENT);
    expect(block).toBe(2);
  });

  it('does nothing when the pick is cancelled', async () => {
    world.quickPickIndex = undefined;
    await run();
    expect(reveal).not.toHaveBeenCalled();
  });

  it('lists the headings without numbers when there is no project', async () => {
    open(TEXT, false);
    await run();
    expect(labels()).toEqual(['One', '\u2003Two', 'Three']);
  });

  it('says so when the document has no headings', async () => {
    open(`${FRONT}Only text.\n`);
    await run();
    expect(world.quickPicks).toEqual([]);
    expect(world.infos).toEqual([expect.stringContaining('no headings')]);
  });

  it('says so when the editor in front is not a Stanza document', async () => {
    world.activeTab = { input: new vscode.TabInputText(vscode.Uri.file('/w/p/notes.md')) };
    await run();
    expect(world.errors).toEqual([expect.stringContaining('open a Stanza document')]);
    expect(world.quickPicks).toEqual([]);
  });
});
