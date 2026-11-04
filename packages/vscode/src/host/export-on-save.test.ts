import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ExportOnSave } from './export-on-save.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { reset, saveDocument, world } from './vscode-fake.testing.js';

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
const FRONT = '---\nphrase-format: 1\ntitle: "T"\n---\n\n';
const GOOD = `${FRONT}<!-- phrase: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const BAD = `${FRONT}<!-- phrase: .missing -->\nText\n`;

const DOCUMENT = '/w/p/documents/one.phrase.md';
const OUTPUT = '/w/p/build/documents/one.docx';
const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;

function open(text = GOOD, extra: Record<string, string> = {}, project = true): void {
  reset(
    {
      ...(project ? { '/w/p/phrase.yaml': PROJECT, '/w/p/styles/default.yaml': STYLESHEET } : {}),
      [DOCUMENT]: text,
      ...extra,
    },
    DOCUMENT,
    text,
  );
  new ExportOnSave(new ProjectDiagnostics(), log);
}

const settled = async (check: () => void): Promise<void> => {
  await vi.waitFor(check);
};

beforeEach(() => {
  open();
});

describe('saving a document', () => {
  it('writes its DOCX into the build folder, and says so', async () => {
    saveDocument();
    await settled(() => {
      expect(world.files.has(OUTPUT)).toBe(true);
    });
    expect(world.directories).toContain('/w/p/build/documents');
    expect(world.status).toEqual(['Phrase: exported build/documents/one.docx']);
    expect(world.errors).toEqual([]);
  });

  it('writes nothing when the setting is off', async () => {
    world.settings['exportOnSave'] = false;
    saveDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(world.files.has(OUTPUT)).toBe(false);
    expect(world.status).toEqual([]);
  });

  it('ignores the save of a file that is not a document', async () => {
    const stylesheet = {
      uri: { toString: () => 'file:///w/p/styles/default.yaml', path: '/w/p/styles/default.yaml' },
      fileName: '/w/p/styles/default.yaml',
    };
    for (const listener of world.saveListeners) listener(stylesheet as never);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(world.status).toEqual([]);
  });

  it('does nothing for a document that is not in a project', async () => {
    open(GOOD, {}, false);
    saveDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(world.files.has(OUTPUT)).toBe(false);
    expect(world.status).toEqual([]);
  });

  it('does not export a document with errors, and leaves the earlier DOCX as it was', async () => {
    open(BAD, { [OUTPUT]: 'earlier export' });
    saveDocument();
    await settled(() => {
      expect(world.status).toHaveLength(1);
    });
    expect(world.status[0]).toContain('not exported');
    expect(world.files.get(OUTPUT)).toBe('earlier export');
  });

  it('says what went wrong when the file cannot be written, as when Word has it open', async () => {
    world.failWrites = true;
    saveDocument();
    await settled(() => {
      expect(world.errors).toHaveLength(1);
    });
    expect(world.errors[0]).toContain('could not be written');
    expect(world.errors[0]).toContain('EBUSY');
    expect(world.errors[0]).toContain('open in Word');
    expect(world.status).toEqual([]);
  });
});
