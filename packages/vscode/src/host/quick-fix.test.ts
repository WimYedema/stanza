import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { StylesheetSaves } from './declare-variant.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import { registerDeclareVariant } from './quick-fix.js';
import { FakeUri, reset, saveDocument, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const SHEET = '/w/p/styles/default.yaml';
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
const DOCUMENT = '/w/p/documents/one.phrase.md';
const MARKED = `${FRONT}<!-- phrase: #k7m2q9x4zb -->\n# One\n\nSome **strong** text.\n`;

const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;
const diagnostics = new ProjectDiagnostics();

type Handler = (...args: unknown[]) => Promise<void>;
const command = (): Handler => {
  const handler = world.commandHandlers.get('phrase.declareVariant');
  if (handler === undefined) throw new Error('The command is not registered.');
  return handler as unknown as Handler;
};

beforeEach(async () => {
  reset(
    {
      '/w/p/phrase.yaml': "phrase-format: 1\ntitle: 'P'\nstylesheet: 'styles/default.yaml'\n",
      [SHEET]: STYLESHEET,
      [DOCUMENT]: MARKED,
    },
    DOCUMENT,
    MARKED,
  );
  registerDeclareVariant(diagnostics, new StylesheetSaves(log));
  await diagnostics.refresh(new FakeUri('/w/p') as never);
});

function actions() {
  const entries = world.diagnostics.get(DOCUMENT) as vscode.Diagnostic[];
  return world.codeActions?.provideCodeActions(world.document, undefined, {
    diagnostics: entries,
  }) as { title: string; command: { command: string; arguments: unknown[] } }[];
}

describe('the quick fix', () => {
  it('is offered on the diagnostic of a mark that the style does not allow', () => {
    const [action, ...rest] = actions();
    expect(rest).toEqual([]);
    expect(action?.title).toBe('Allow strong in the style "body"');
    expect(action?.command).toMatchObject({
      command: 'phrase.declareVariant',
      arguments: [world.document?.uri, 'body', 'strong'],
    });
  });

  it('declares the variant, saves the stylesheet with the document, and clears the problem', async () => {
    const [action] = actions();
    await command()(...(action?.command.arguments ?? []));
    expect(world.open.get(SHEET)?.text).toContain('strong: { bold: true }');
    expect(world.open.get(SHEET)?.isDirty).toBe(true);
    expect(world.files.get(SHEET)).toBe(STYLESHEET);
    expect(world.diagnostics.get(DOCUMENT)).toBeUndefined();

    saveDocument();
    await vi.waitFor(() => {
      expect(world.saved).toEqual([SHEET]);
    });
    expect(world.files.get(SHEET)).toContain('strong: { bold: true }');
  });

  it('shows why when the variant cannot be declared', async () => {
    await command()(world.document?.uri, 'nope', 'strong');
    expect(world.errors).toEqual(['The stylesheet has no paragraph style "nope".']);
    await command()(world.document?.uri, 'body', 'underline');
    expect(world.errors).toHaveLength(2);
    expect(world.open.size).toBeLessThanOrEqual(1);
    expect(world.open.get(SHEET)?.isDirty ?? false).toBe(false);
  });

  it('offers nothing on a diagnostic without a fix', () => {
    expect(
      world.codeActions?.provideCodeActions(world.document, undefined, {
        diagnostics: [{ code: 'x', message: 'y' }],
      }),
    ).toEqual([]);
  });
});

describe('the quick fix for a color that is not a token (ADR 0074)', () => {
  const RAW = STYLESHEET.replace('  body: {}\n', "  body:\n    color: '#112233'\n");

  beforeEach(async () => {
    reset(
      {
        '/w/p/phrase.yaml': "phrase-format: 1\ntitle: 'P'\nstylesheet: 'styles/default.yaml'\n",
        [SHEET]: RAW,
        [DOCUMENT]: MARKED,
      },
      DOCUMENT,
      MARKED,
    );
    registerDeclareVariant(diagnostics, new StylesheetSaves(log));
    await diagnostics.refresh(new FakeUri('/w/p') as never);
  });

  const sheetActions = () =>
    world.codeActions?.provideCodeActions({ uri: new FakeUri(SHEET) }, undefined, {
      diagnostics: world.diagnostics.get(SHEET) as vscode.Diagnostic[],
    }) as { title: string; command: { command: string; arguments: unknown[] } }[];

  it('is offered on the diagnostic in the stylesheet', () => {
    const [action, ...rest] = sheetActions();
    expect(rest).toEqual([]);
    expect(action?.command.command).toBe('phrase.useTokens');
  });

  it('moves the value into a token in the open stylesheet, and clears the problem', async () => {
    const [action] = sheetActions();
    const handler = world.commandHandlers.get('phrase.useTokens');
    await (handler as unknown as Handler)(...(action?.command.arguments ?? []));
    expect(world.open.get(SHEET)?.text).toContain('color: color-112233');
    expect(world.open.get(SHEET)?.text).toContain("color-112233: '#112233'");
    expect(world.open.get(SHEET)?.isDirty).toBe(true);
    expect(world.files.get(SHEET)).toBe(RAW);
    expect(world.diagnostics.get(SHEET)).toBeUndefined();
  });
});
