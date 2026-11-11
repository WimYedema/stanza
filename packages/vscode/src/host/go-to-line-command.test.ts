import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GO_TO_LINE_COMMAND, registerGoToLine } from './go-to-line-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const FRONT = '---\nphrase-format: 1\ntitle: "T"\n---\n\n';
// Lines: 6 "# One", 8 "Some text.", 10 "## Two", 12 "# Three".
const TEXT = `${FRONT}# One\n\nSome text.\n\n## Two\n\n# Three\n`;

const DOCUMENT = '/w/p/documents/one.phrase.md';
const reveal = vi.fn<(document: vscode.Uri, block: number) => void>();

function open(text = TEXT): void {
  reset({ [DOCUMENT]: text }, DOCUMENT, text);
  world.activeTab = {
    input: new vscode.TabInputCustom(vscode.Uri.file(DOCUMENT), 'phrase.editor'),
  };
  registerGoToLine(reveal);
}

async function run(typed: string | undefined): Promise<void> {
  world.inputValue = typed;
  const handler = world.commandHandlers.get(GO_TO_LINE_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

beforeEach(() => {
  reveal.mockReset();
  open();
});

describe('Phrase: Go to Line', () => {
  it.each([
    ['2', 0],
    ['8', 1],
    ['9', 1],
    ['10', 2],
    ['documents/one.phrase.md#L12', 3],
    ['500', 3],
  ])('reveals the block that holds %j', async (typed, block) => {
    await run(typed);
    expect(reveal).toHaveBeenCalledTimes(1);
    const [uri, revealed] = reveal.mock.calls[0] ?? [];
    expect(uri?.path).toBe(DOCUMENT);
    expect(revealed).toBe(block);
  });

  it('asks for a line, and refuses what is not one', async () => {
    await run('8');
    const options = world.inputOptions;
    expect(options?.validateInput?.('12')).toBeUndefined();
    expect(options?.validateInput?.('x')).toEqual(expect.stringContaining('line number'));
    expect(options?.validateInput?.('0')).toEqual(expect.stringContaining('line number'));
  });

  it('does nothing when the box is cancelled', async () => {
    await run(undefined);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('says so when the document has no blocks', async () => {
    open(FRONT);
    await run('3');
    expect(reveal).not.toHaveBeenCalled();
    expect(world.infos).toEqual([expect.stringContaining('no blocks')]);
  });

  it('says so when the editor in front is not a Phrase document', async () => {
    world.activeTab = { input: new vscode.TabInputText(vscode.Uri.file('/w/p/notes.md')) };
    await run('3');
    expect(world.errors).toEqual([expect.stringContaining('open a Phrase document')]);
    expect(reveal).not.toHaveBeenCalled();
  });
});
