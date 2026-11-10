import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { HostMessage } from '../shared/protocol.js';
import { StylesheetSaves } from './declare-variant.js';
import { PhraseEditorProvider } from './provider.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import {
  changeDocument,
  fakePanel,
  fromWebview,
  reset,
  saveDocument,
  world,
} from './vscode-fake.testing.js';

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
const CANONICAL = `${FRONT}<!-- phrase: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const OTHER = `${FRONT}<!-- phrase: #a1b2c3d4e5 -->\n# Other\n`;

const files = (extra: Record<string, string> = {}): Record<string, string> => ({
  '/w/p/phrase.yaml': PROJECT,
  '/w/p/styles/default.yaml': STYLESHEET,
  '/w/p/documents/other.phrase.md': OTHER,
  ...extra,
});

const DOCUMENT = '/w/p/documents/one.phrase.md';

const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;

function newProvider(): PhraseEditorProvider {
  return new PhraseEditorProvider(
    { extensionUri: { path: '/ext' } } as unknown as vscode.ExtensionContext,
    new ProjectDiagnostics(),
    log,
    new StylesheetSaves(log),
  );
}

function open(text = CANONICAL, eol = '\n', projectFiles = files()): void {
  reset({ ...projectFiles, [DOCUMENT]: text }, DOCUMENT, text, eol);
  newProvider().resolveCustomTextEditor(
    world.document as unknown as vscode.TextDocument,
    fakePanel() as unknown as vscode.WebviewPanel,
  );
}

/** What the host posted, without the usage of the styles, which has its own tests. */
const posted = (): HostMessage[] =>
  (world.posted as HostMessage[]).filter((message) => message.type !== 'usage');
const usages = (): Extract<HostMessage, { type: 'usage' }>[] =>
  (world.posted as HostMessage[]).filter(
    (message): message is Extract<HostMessage, { type: 'usage' }> => message.type === 'usage',
  );
const settled = async (check: () => void): Promise<void> => {
  await vi.waitFor(check);
};

beforeEach(() => {
  open();
});

describe('the page of the editor', () => {
  it('has a policy with a nonce, and the script of the extension', () => {
    // The fake panel keeps what the extension wrote to it.
    const panel = fakePanel();
    newProvider().resolveCustomTextEditor(
      world.document as unknown as vscode.TextDocument,
      panel as unknown as vscode.WebviewPanel,
    );
    expect(panel.webview.html).toContain("script-src 'nonce-");
    expect(panel.webview.html).toContain('/ext/dist/webview.js');
    expect(panel.webview.options).toMatchObject({ enableScripts: true });
  });
});

describe('starting', () => {
  it('sends the document, the stylesheet and the IDs of the other documents when the webview is ready', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toEqual({
      type: 'init',
      documentText: CANONICAL,
      stylesheetText: STYLESHEET,
      defaults: {},
      usedIds: ['a1b2c3d4e5'],
    });
  });

  it('shows what is wrong with the project in the Problems panel', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    // The other document has a heading with an ID and the document has one too: no problem files.
    expect(world.diagnostics.size).toBe(0);
    open(`${FRONT}# No ID\n`);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(world.diagnostics.get(DOCUMENT)).toHaveLength(1);
  });

  it('refuses a file with no project, with the way out', async () => {
    open(CANONICAL, '\n', { '/w/p/documents/other.phrase.md': OTHER });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused', canFormat: false });
  });

  it('refuses a project with an error in its stylesheet, and says which', async () => {
    open(CANONICAL, '\n', files({ '/w/p/styles/default.yaml': 'phrase-format: 1\nbad: [' }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    const message = posted()[0];
    expect(message?.type).toBe('refused');
    expect(JSON.stringify(message)).toContain('styles/default.yaml');
  });

  it('takes a document with CRLF line endings, and sends it with LF', async () => {
    open(CANONICAL, '\r\n');
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'init', documentText: CANONICAL });
  });
});

describe('the defaults of the project', () => {
  const WITH_DEFAULTS = `${PROJECT}defaults:\n  classification: 'Internal'\n  authors:\n    - 'A'\n  page-template: 'page'\n`;

  it('sends them with the document, for the values of the header and the cover', async () => {
    open(CANONICAL, '\n', files({ '/w/p/phrase.yaml': WITH_DEFAULTS }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({
      type: 'init',
      defaults: { classification: 'Internal', authors: ['A'], pageTemplate: 'page' },
    });
  });

  it('sends them again when the project file changes, and not when it does not', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    const changeProject = (): void => {
      const document = { uri: { toString: () => 'project' }, fileName: '/w/p/phrase.yaml' };
      for (const listener of world.changeListeners) listener({ document } as never);
    };
    changeProject();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(posted()).toHaveLength(1);

    world.files.set('/w/p/phrase.yaml', WITH_DEFAULTS);
    changeProject();
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({
      type: 'defaults',
      defaults: { classification: 'Internal', authors: ['A'], pageTemplate: 'page' },
    });
  });
});

describe('files that are not taken', () => {
  it('refuses a file that is not canonical and offers to format it', async () => {
    open(`${FRONT}* one\n* two\n`);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused', canFormat: true });
  });

  it('refuses a file with something the model cannot hold, without a way to format it', async () => {
    open(`${FRONT}Text.\n\n<div>raw</div>\n`);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused', canFormat: false });
  });

  it('formats on request with one edit, and then opens the file', async () => {
    open(`${FRONT}* one\n* two\n`);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    fromWebview({ type: 'format' });
    await settled(() => {
      expect(posted().map((message) => message.type)).toEqual(['refused', 'init']);
    });
    expect(world.edits).toHaveLength(1);
    expect(world.text).toBe(`${FRONT}- one\n- two\n`);
  });

  it('opens as text on request', async () => {
    fromWebview({ type: 'open-as-text' });
    await settled(() => {
      expect(world.commands).toEqual(['workbench.action.reopenTextEditor']);
    });
  });
});

describe('writing to the file', () => {
  async function started(): Promise<void> {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
  }

  it('applies only the lines that differ, and does not send its own change back', async () => {
    await started();
    const changed = CANONICAL.replace('Some text.', 'Some more text.');
    fromWebview({ type: 'change', text: changed });
    await settled(() => {
      expect(world.text).toBe(changed);
    });
    expect(world.edits).toEqual([{ start: [8, 0], end: [9, 0], text: 'Some more text.\n' }]);
    // Give the queue time to show that nothing else is sent.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted()).toHaveLength(1);
  });

  it('keeps the line endings of the file', async () => {
    open(CANONICAL, '\r\n');
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    const changed = CANONICAL.replace('Some text.', 'Some more text.');
    fromWebview({ type: 'change', text: changed });
    await settled(() => {
      expect(world.text).toBe(changed);
    });
    expect(world.document?.getText()).toBe(changed.replace(/\n/g, '\r\n'));
    expect(world.edits).toHaveLength(1);
  });

  it('takes several changes in a row in order, and sends none of them back', async () => {
    await started();
    const first = CANONICAL.replace('Some text.', 'One.');
    const second = CANONICAL.replace('Some text.', 'Two.');
    fromWebview({ type: 'change', text: first });
    fromWebview({ type: 'change', text: second });
    await settled(() => {
      expect(world.text).toBe(second);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted()).toHaveLength(1);
  });

  it('ignores a message that is not of the protocol, and an edit that changes nothing', async () => {
    await started();
    fromWebview({ type: 'change', text: 42 });
    fromWebview('nonsense');
    fromWebview({ type: 'change', text: CANONICAL });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(world.edits).toEqual([]);
    expect(posted()).toHaveLength(1);
  });

  it('puts the content back in the editor when VS Code does not apply an edit', async () => {
    await started();
    world.failEdits = true;
    fromWebview({ type: 'change', text: CANONICAL.replace('Some text.', 'Lost.') });
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({ type: 'external-text', text: CANONICAL });
  });
});

describe('changes from outside', () => {
  it('sends the new text when the document changes in another way', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    const text = CANONICAL.replace('Some text.', 'A checkout.');
    changeDocument(text);
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({ type: 'external-text', text });
  });

  it('refuses when the text becomes something the editor cannot take, and opens again when fixed', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    changeDocument(`${CANONICAL}\n<div>raw</div>\n`);
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toMatchObject({ type: 'refused' });
    changeDocument(CANONICAL);
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(posted()[2]).toMatchObject({ type: 'init', documentText: CANONICAL });
  });
});

describe('allowing a mark in a style', () => {
  const SHEET = '/w/p/styles/default.yaml';
  const ALLOWED = STYLESHEET.replace(
    '  body: {}\n',
    '  body:\n    variants:\n      strong: { bold: true }\n',
  );

  async function started(): Promise<void> {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
  }

  it('edits the open stylesheet, sends it, and then answers', async () => {
    await started();
    fromWebview({ type: 'declare-variant', style: 'body', mark: 'strong' });
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(posted()[1]).toEqual({ type: 'stylesheet', text: ALLOWED });
    expect(posted()[2]).toEqual({ type: 'declared', ok: true, message: '' });
    expect(world.open.get(SHEET)?.text).toBe(ALLOWED);
  });

  it('does not save the stylesheet until the document is saved', async () => {
    await started();
    fromWebview({ type: 'declare-variant', style: 'body', mark: 'strong' });
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(world.open.get(SHEET)?.isDirty).toBe(true);
    expect(world.files.get(SHEET)).toBe(STYLESHEET);
    expect(world.saved).toEqual([]);

    saveDocument();
    await settled(() => {
      expect(world.saved).toEqual([SHEET]);
    });
    expect(world.files.get(SHEET)).toBe(ALLOWED);
    expect(world.open.get(SHEET)?.isDirty).toBe(false);
  });

  it('saves the stylesheet with the document once, and not with the next save', async () => {
    await started();
    fromWebview({ type: 'declare-variant', style: 'body', mark: 'strong' });
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    saveDocument();
    await settled(() => {
      expect(world.saved).toHaveLength(1);
    });
    saveDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(world.saved).toHaveLength(1);
  });

  it('answers that it is done when the variant is declared already, and sends no stylesheet', async () => {
    await started();
    fromWebview({ type: 'declare-variant', style: 'body', mark: 'strong' });
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    fromWebview({ type: 'declare-variant', style: 'body', mark: 'strong' });
    await settled(() => {
      expect(posted()).toHaveLength(4);
    });
    expect(posted()[3]).toEqual({ type: 'declared', ok: true, message: '' });
  });

  it.each([
    ['a style that is not there', 'nope', 'strong', 'no paragraph style "nope"'],
    ['a mark that is not one', 'body', 'underline', 'could not be declared'],
    ['a name that is not a style name', 'Not A Style', 'strong', 'could not be declared'],
  ])('refuses %s, and changes nothing', async (_what, style, mark, message) => {
    await started();
    fromWebview({ type: 'declare-variant', style, mark });
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toMatchObject({ type: 'declared', ok: false });
    expect(posted()[1]).toMatchObject({ message: expect.stringContaining(message) as string });
    expect(world.open.get(SHEET)?.isDirty ?? false).toBe(false);
  });

  it('says so when VS Code does not apply the edit', async () => {
    await started();
    world.failEdits = true;
    fromWebview({ type: 'declare-variant', style: 'body', mark: 'strong' });
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({
      type: 'declared',
      ok: false,
      message: 'The edit of the stylesheet was not applied.',
    });
  });
});

describe('the usage of the styles', () => {
  const ONE = 'documents/one.phrase.md';
  const OTHER_FILE = 'documents/other.phrase.md';

  it('sends where the styles are used, for each document, after the document', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(usages()).toHaveLength(1);
    });
    const { usage } = usages()[0] ?? { usage: undefined };
    expect(usage?.current).toBe(ONE);
    expect(usage?.paragraph['heading-1']).toEqual([
      { file: ONE, direct: 0, default: 1, inherited: 0 },
      { file: OTHER_FILE, direct: 0, default: 1, inherited: 0 },
    ]);
    expect(usage?.paragraph['body']).toEqual([{ file: ONE, direct: 0, default: 1, inherited: 0 }]);
    expect(usage?.paragraph['list-bulleted']).toBeUndefined();
    expect(usage?.table).toEqual({});
  });

  it('sends it again when another document starts to use a style, and not when nothing changed', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(usages()).toHaveLength(1);
    });
    const changeOther = (): void => {
      const document = {
        uri: { toString: () => 'other' },
        fileName: '/w/p/documents/other.phrase.md',
      };
      for (const listener of world.changeListeners) listener({ document } as never);
    };
    changeOther();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(usages()).toHaveLength(1);

    world.files.set('/w/p/documents/other.phrase.md', `${OTHER}\nA paragraph.\n`);
    changeOther();
    await settled(() => {
      expect(usages()).toHaveLength(2);
    });
    expect(usages()[1]?.usage.paragraph['body']).toEqual([
      { file: ONE, direct: 0, default: 1, inherited: 0 },
      { file: OTHER_FILE, direct: 0, default: 1, inherited: 0 },
    ]);
  });

  it('opens the style editor when the page asks for it', async () => {
    fromWebview({ type: 'edit-styles' });
    await settled(() => {
      expect(world.commands).toEqual(['phrase.editStyles']);
    });
  });
});
