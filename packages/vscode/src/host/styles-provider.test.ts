import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { StylesHostMessage } from '../shared/styles-protocol.js';
import { StylesEditorProvider, requestStyleSelection } from './styles-provider.js';
import { changeDocument, fakePanel, fromWebview, reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `stanza-format: 1
title: 'Project'
stylesheet: 'styles/default.yaml'
`;
const STYLESHEET = 'stanza-format: 1\nparagraph-styles:\n  body: {}\n';
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
  '/w/p/stanza.yaml': PROJECT,
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
    panel = open('/w/p/styles/other.yaml', 'stanza-format: 1\n', {
      ...project(),
      '/w/p/styles/other.yaml': 'stanza-format: 1\n',
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
    open('/w/p/stanza.yaml', PROJECT, project());
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
      title: 'This file is not in a Stanza project',
    });
  });

  it('refuses a project with an error in its project file, and says which', async () => {
    open(SHEET, STYLESHEET, project({ '/w/p/stanza.yaml': 'stanza-format: 1\n' }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused', title: 'The project has errors' });
    expect(JSON.stringify(posted()[0])).toContain('stanza.yaml');
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
      expect(world.text).toBe('stanza-format: 1\nparagraph-styles:\n  body:\n    size: 12\n');
    });
    expect(world.edits).toHaveLength(1);
    // The page is told of the new text by the change of the document, as for any change.
    await settled(() => {
      expect(posted()[1]).toMatchObject({ type: 'text' });
    });
  });

  it('removes a property, and writes a style that has nothing left as {}', async () => {
    open(SHEET, 'stanza-format: 1\nparagraph-styles:\n  body:\n    size: 12\n', project());
    await ready();
    fromWebview({ type: 'unset', path: SIZE });
    await settled(() => {
      expect(world.text).toBe('stanza-format: 1\nparagraph-styles:\n  body: {}\n');
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
    open('/w/p/styles/other.yaml', 'stanza-format: 1\n', {
      ...project(),
      '/w/p/styles/other.yaml': 'stanza-format: 1\n',
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
    changeDocument('stanza-format: 1\nparagraph-styles:\n  body:\n    size: 11\n');
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({
      type: 'text',
      text: 'stanza-format: 1\nparagraph-styles:\n  body:\n    size: 11\n',
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

describe('adding and deleting styles', () => {
  const READY = { type: 'ready' };
  const FULL = `stanza-format: 1
paragraph-styles:
  body: {}
  heading-1: { based-on: body }
  heading-2: { based-on: body }
  heading-3: { based-on: body }
  heading-4: { based-on: body }
  heading-5: { based-on: body }
  heading-6: { based-on: body }
  code: { based-on: body }
  list-bulleted: { based-on: body }
  list-numbered: { based-on: body }
  note: { based-on: body }
  loose: { based-on: body }
  warning-note: { based-on: note }
character-styles:
  status: { bold: true }
table-styles:
  table: {}
`;
  const DOCUMENT =
    '---\nstanza-format: 1\ntitle: "Doc"\n---\n\n<!-- stanza: #efwkbkgsbr .loose -->\nText.\n';

  async function ready(extra: Record<string, string> = {}): Promise<void> {
    open(SHEET, FULL, project({ [SHEET]: FULL, ...extra }));
    fromWebview(READY);
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
  }
  const refusal = async (): Promise<string> => {
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    const message = posted()[1];
    if (message?.type !== 'edit-refused') throw new Error('Not refused.');
    return message.message;
  };

  it('adds an empty style that is based on another', async () => {
    await ready();
    fromWebview({ type: 'add-style', kind: 'paragraph-style', name: 'tip', basedOn: 'note' });
    await settled(() => {
      expect(world.text).toContain('  tip: { based-on: note }\n');
    });
  });

  it('adds a style that is based on none', async () => {
    await ready();
    fromWebview({ type: 'add-style', kind: 'character-style', name: 'marker' });
    await settled(() => {
      expect(world.text).toContain('  marker: {}\n');
    });
  });

  it('refuses a name that is not kebab-case, one that is taken, and a base that is not there', async () => {
    await ready();
    fromWebview({ type: 'add-style', kind: 'paragraph-style', name: 'Not Kebab' });
    expect(await refusal()).toContain('kebab-case');
    fromWebview({ type: 'add-style', kind: 'paragraph-style', name: 'note' });
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(JSON.stringify(posted()[2])).toContain('There is a paragraph style \\"note\\" already.');
    fromWebview({ type: 'add-style', kind: 'table-style', name: 'grid', basedOn: 'nothing' });
    await settled(() => {
      expect(posted()).toHaveLength(4);
    });
    expect(JSON.stringify(posted()[3])).toContain('There is no table style \\"nothing\\"');
    expect(world.edits).toEqual([]);
  });

  it('deletes a style that nothing uses, after the person says yes', async () => {
    await ready();
    world.warningChoice = 'Delete';
    fromWebview({ type: 'delete-style', kind: 'character-style', name: 'status' });
    await settled(() => {
      expect(world.text).not.toContain('status');
    });
    expect(world.warnings[0]).toContain('Delete the character style "status"');
  });

  it('leaves the style when the person does not say yes', async () => {
    await ready();
    fromWebview({ type: 'delete-style', kind: 'character-style', name: 'status' });
    await settled(() => {
      expect(world.warnings).toHaveLength(1);
    });
    expect(world.edits).toEqual([]);
  });

  it('refuses to delete a style that a document uses, and says where', async () => {
    await ready({ '/w/p/documents/a.stanza.md': DOCUMENT });
    fromWebview({ type: 'delete-style', kind: 'paragraph-style', name: 'loose' });
    expect(await refusal()).toContain('The documents use it: documents/a.stanza.md (1 block).');
    expect(world.warnings).toEqual([]);
    expect(world.edits).toEqual([]);
  });

  it('refuses to delete a style that another style is based on', async () => {
    await ready();
    fromWebview({ type: 'delete-style', kind: 'paragraph-style', name: 'note' });
    expect(await refusal()).toContain('The paragraph style "warning-note" is based on it.');
  });

  it('refuses to delete a style that every stylesheet needs', async () => {
    await ready();
    fromWebview({ type: 'delete-style', kind: 'table-style', name: 'table' });
    expect(await refusal()).toContain('every stylesheet needs');
  });

  it('refuses when the project has errors, since the documents cannot be known', async () => {
    await ready({ '/w/p/stanza.yaml': `${PROJECT}defaults:\n  page-template: nowhere\n` });
    fromWebview({ type: 'delete-style', kind: 'paragraph-style', name: 'loose' });
    expect(await refusal()).toContain('cannot be known');
  });
});

describe('selecting a style on request', () => {
  const uri = (): vscode.Uri => world.document?.uri as unknown as vscode.Uri;
  const selection = { kind: 'table-style', name: 'table' } as const;

  it('selects the style after the start when it was asked for before', async () => {
    requestStyleSelection(uri(), selection);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[0]).toMatchObject({ type: 'init' });
    expect(posted()[1]).toEqual({ type: 'select-style', kind: 'table-style', name: 'table' });
  });

  it('selects the style at once when the editor is open, and only once', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    requestStyleSelection(uri(), selection);
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toMatchObject({ type: 'select-style', name: 'table' });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(posted()[2]).toMatchObject({ type: 'init' });
  });

  it('does not select anything in an editor that was refused', async () => {
    panel = open('/w/p/styles/other.yaml', 'stanza-format: 1\n', {
      ...project(),
      '/w/p/styles/other.yaml': 'stanza-format: 1\n',
    });
    requestStyleSelection(uri(), selection);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused' });
  });
});
