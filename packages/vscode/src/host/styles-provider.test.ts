import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { StylesHostMessage } from '../shared/styles-protocol.js';
import { StylesEditorProvider } from './styles-provider.js';
import { changeDocument, fakePanel, fromWebview, reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `phrase-format: 1
title: 'Project'
stylesheet: 'styles/default.yaml'
`;
const STYLESHEET = 'phrase-format: 1\nparagraph-styles:\n  body: {}\n';
const SHEET = '/w/p/styles/default.yaml';
const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;

function open(
  path: string,
  text: string,
  files: Record<string, string>,
): ReturnType<typeof fakePanel> {
  reset(files, path, text);
  const panel = fakePanel();
  new StylesEditorProvider(
    { extensionUri: { path: '/ext' } } as unknown as vscode.ExtensionContext,
    log,
  ).resolveCustomTextEditor(
    world.document as unknown as vscode.TextDocument,
    panel as unknown as vscode.WebviewPanel,
  );
  return panel;
}

const posted = (): StylesHostMessage[] => world.posted as StylesHostMessage[];
const settled = async (check: () => void): Promise<void> => {
  await vi.waitFor(check);
};
const project = (extra: Record<string, string> = {}): Record<string, string> => ({
  '/w/p/phrase.yaml': PROJECT,
  [SHEET]: STYLESHEET,
  ...extra,
});

let panel: ReturnType<typeof fakePanel>;

beforeEach(() => {
  panel = open(SHEET, STYLESHEET, project());
});

describe('the page of the style editor', () => {
  it('has a policy with a nonce, and the script of the style editor', () => {
    expect(panel.webview.html).toContain("script-src 'nonce-");
    expect(panel.webview.html).toContain('/ext/dist/styles.js');
    expect(panel.webview.options).toMatchObject({ enableScripts: true });
  });
});

describe('starting', () => {
  it('sends the text of the stylesheet when the webview is ready', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toEqual({ type: 'init', text: STYLESHEET });
  });

  it('refuses a file that is not the stylesheet of its project, and says which is', async () => {
    panel = open('/w/p/styles/other.yaml', 'phrase-format: 1\n', {
      ...project(),
      '/w/p/styles/other.yaml': 'phrase-format: 1\n',
    });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toEqual({
      type: 'refused',
      title: 'This file is not the stylesheet of its project',
      reasons: [{ message: 'The stylesheet of the project is styles/default.yaml.' }],
    });
  });

  it('refuses the project file itself', async () => {
    open('/w/p/phrase.yaml', PROJECT, project());
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused' });
  });

  it('refuses a file with no project', async () => {
    open(SHEET, STYLESHEET, { [SHEET]: STYLESHEET });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({
      type: 'refused',
      title: 'This file is not in a Phrase project',
    });
  });

  it('refuses a project with an error in its project file, and says which', async () => {
    open(SHEET, STYLESHEET, project({ '/w/p/phrase.yaml': 'phrase-format: 1\n' }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused', title: 'The project has errors' });
    expect(JSON.stringify(posted()[0])).toContain('phrase.yaml');
  });
});

describe('changes from the page', () => {
  const SIZE = ['paragraph-styles', 'body', 'size'];
  const READY = { type: 'ready' };

  async function ready(): Promise<void> {
    fromWebview(READY);
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
  }

  it('sets a property in the open stylesheet, as an edit of the lines that differ', async () => {
    await ready();
    fromWebview({ type: 'set', path: SIZE, value: 12 });
    await settled(() => {
      expect(world.text).toBe('phrase-format: 1\nparagraph-styles:\n  body:\n    size: 12\n');
    });
    expect(world.edits).toHaveLength(1);
    // The page is told of the new text by the change of the document, as for any change.
    await settled(() => {
      expect(posted()[1]).toMatchObject({ type: 'text' });
    });
  });

  it('removes a property, and writes a style that has nothing left as {}', async () => {
    open(SHEET, 'phrase-format: 1\nparagraph-styles:\n  body:\n    size: 12\n', project());
    await ready();
    fromWebview({ type: 'unset', path: SIZE });
    await settled(() => {
      expect(world.text).toBe('phrase-format: 1\nparagraph-styles:\n  body: {}\n');
    });
  });

  it('tells the page why a change was refused, and changes nothing', async () => {
    await ready();
    fromWebview({ type: 'set', path: SIZE, value: -1 });
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toMatchObject({
      type: 'edit-refused',
      message: expect.stringContaining('must be greater than zero') as string,
    });
    expect(world.edits).toEqual([]);
  });

  it('does not change a file that has not been shown to be the stylesheet of its project', async () => {
    fromWebview({ type: 'set', path: SIZE, value: 12 });
    open('/w/p/styles/other.yaml', 'phrase-format: 1\n', {
      ...project(),
      '/w/p/styles/other.yaml': 'phrase-format: 1\n',
    });
    fromWebview(READY);
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    fromWebview({ type: 'set', path: SIZE, value: 12 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(world.edits).toEqual([]);
    expect(posted()).toHaveLength(1);
  });
});

describe('while it is open', () => {
  it('sends the text again when the stylesheet changes, with LF', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    changeDocument('phrase-format: 1\nparagraph-styles:\n  body:\n    size: 11\n');
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({
      type: 'text',
      text: 'phrase-format: 1\nparagraph-styles:\n  body:\n    size: 11\n',
    });
  });

  it('opens the file as text when asked', async () => {
    fromWebview({ type: 'open-as-text' });
    await settled(() => {
      expect(world.commands).toEqual(['workbench.action.reopenTextEditor']);
    });
  });

  it('ignores a message that is not one of the protocol', async () => {
    fromWebview({ type: 'format' });
    fromWebview('ready');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted()).toEqual([]);
    expect(world.commands).toEqual([]);
  });
});
