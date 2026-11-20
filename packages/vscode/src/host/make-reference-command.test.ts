import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MAKE_REFERENCE_COMMAND, registerMakeReference } from './make-reference-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const DOCUMENT = '/w/p/documents/one.stanza.md';
const request = vi.fn<(document: vscode.Uri) => void>();

function open(path = DOCUMENT): void {
  reset({ [path]: '# One\n' }, path, '# One\n');
  world.activeTab = { input: new vscode.TabInputCustom(vscode.Uri.file(path), 'stanza.editor') };
  registerMakeReference(request);
}

function run(): void {
  const handler = world.commandHandlers.get(MAKE_REFERENCE_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  handler();
}

beforeEach(() => {
  request.mockReset();
});

describe('Stanza: Make Reference', () => {
  it('asks the editor in front to open its list of headings', () => {
    open();
    run();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0].path).toBe(DOCUMENT);
  });

  it('does nothing for a file that is not a Stanza document', () => {
    open('/w/p/notes.md');
    run();
    expect(request).not.toHaveBeenCalled();
  });
});
