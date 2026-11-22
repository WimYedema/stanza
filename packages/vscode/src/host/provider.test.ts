import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { HostMessage } from '../shared/protocol.js';
import { StylesheetSaves } from './declare-variant.js';
import { StanzaEditorProvider } from './provider.js';
import { ProjectDiagnostics } from './project-diagnostics.js';
import {
  changeDocument,
  FakeUri,
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
const CANONICAL = `${FRONT}<!-- stanza: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const OTHER = `${FRONT}<!-- stanza: #a1b2c3d4e5 -->\n# Other\n`;
const OTHER_WITH_TARGET_AFTER_FIRST = `${FRONT}<!-- stanza: #a1b2c3d4e5 -->\n# First\n\n<!-- stanza: #f1e2d3c4b5 -->\n# Target\n`;

const files = (extra: Record<string, string> = {}): Record<string, string> => ({
  '/w/p/stanza.yaml': PROJECT,
  '/w/p/styles/default.yaml': STYLESHEET,
  '/w/p/documents/other.stanza.md': OTHER,
  ...extra,
});

const DOCUMENT = '/w/p/documents/one.stanza.md';

const log = { appendLine: () => undefined } as unknown as vscode.OutputChannel;

function newProvider(diagnostics = new ProjectDiagnostics()): StanzaEditorProvider {
  return new StanzaEditorProvider(
    { extensionUri: { path: '/ext' } } as unknown as vscode.ExtensionContext,
    diagnostics,
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
  (world.posted as HostMessage[]).filter(
    (message) =>
      message.type !== 'usage' &&
      message.type !== 'diagnostics' &&
      message.type !== 'project-ready',
  );
const diagnosticsPosted = (): Extract<HostMessage, { type: 'diagnostics' }>[] =>
  (world.posted as HostMessage[]).filter(
    (message): message is Extract<HostMessage, { type: 'diagnostics' }> =>
      message.type === 'diagnostics',
  );
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
  it('sends project link schemes initially and refreshes changed or removed settings without source edits', async () => {
    open(
      CANONICAL,
      '\n',
      files({
        '/w/p/stanza.yaml': `${PROJECT}link-schemes:\n  jira: https://example.org/{id}\n`,
      }),
    );
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()[0]).toMatchObject({
        type: 'init',
        linkSchemes: { jira: 'https://example.org/{id}' },
      });
    });
    for (const [definition, schemes] of [
      [
        'link-schemes:\n  jira: https://other.example/{id}\n',
        { jira: 'https://other.example/{id}' },
      ],
      ['', {}],
    ] as const) {
      const text = PROJECT + definition;
      world.files.set('/w/p/stanza.yaml', text);
      const document = {
        uri: new FakeUri('/w/p/stanza.yaml'),
        fileName: '/w/p/stanza.yaml',
        getText: () => text,
      };
      for (const listener of world.changeListeners) listener({ document });
      await settled(() => {
        expect(world.posted).toContainEqual({ type: 'link-schemes', schemes });
      });
    }
    expect(world.edits).toEqual([]);
    expect(world.text).toBe(CANONICAL);
  });

  it('shows locally checked content before another document finishes loading, then enables editing with project IDs', async () => {
    const read = vscode.workspace.fs.readFile.bind(vscode.workspace.fs);
    let release = (): void => {
      throw new Error('The project load has not started.');
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async (uri) => {
      const bytes = await read(uri);
      if (uri.path.endsWith('/other.stanza.md')) await gate;
      return bytes;
    });
    try {
      fromWebview({ type: 'ready' });
      await settled(() => {
        expect(world.posted).toContainEqual(
          expect.objectContaining({ type: 'init', projectReady: false }),
        );
      });
      expect(
        world.posted.some((message) => (message as HostMessage).type === 'project-ready'),
      ).toBe(false);
      expect(world.edits).toEqual([]);
      release();
      await settled(() => {
        expect(world.posted).toContainEqual({ type: 'project-ready', usedIds: ['a1b2c3d4e5'] });
      });
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it('uses the tree/diagnostics snapshot for a warm open without rereading other documents', async () => {
    reset({ ...files(), [DOCUMENT]: CANONICAL }, DOCUMENT, CANONICAL);
    const diagnostics = new ProjectDiagnostics();
    const root = new FakeUri('/w/p') as unknown as vscode.Uri;
    await diagnostics.load(root);
    const read = vi.spyOn(vscode.workspace.fs, 'readFile');
    try {
      newProvider(diagnostics).resolveCustomTextEditor(
        world.document as unknown as vscode.TextDocument,
        fakePanel() as unknown as vscode.WebviewPanel,
      );
      fromWebview({ type: 'ready' });
      await settled(() => {
        expect(world.posted).toContainEqual(
          expect.objectContaining({
            type: 'init',
            projectReady: true,
            usedIds: ['a1b2c3d4e5'],
          }),
        );
      });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      diagnostics.dispose();
    }
  });

  it('does not enable preview editing when project discovery fails', async () => {
    const spy = vi
      .spyOn(vscode.workspace.fs, 'readDirectory')
      .mockRejectedValue(new Error('Cannot scan project'));
    try {
      fromWebview({ type: 'ready' });
      await settled(() => {
        expect(world.posted).toContainEqual(
          expect.objectContaining({ type: 'refused', title: 'The project could not be loaded' }),
        );
      });
      expect(world.posted).toContainEqual(
        expect.objectContaining({ type: 'init', projectReady: false }),
      );
      expect(
        world.posted.some((message) => (message as HostMessage).type === 'project-ready'),
      ).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it.each([false, true])(
    'keeps editing gated with unreadable project IDs, including cached snapshots (cached=%s)',
    async (cached) => {
      reset({ ...files(), [DOCUMENT]: CANONICAL }, DOCUMENT, CANONICAL);
      const diagnostics = new ProjectDiagnostics();
      const read = vscode.workspace.fs.readFile.bind(vscode.workspace.fs);
      const spy = vi
        .spyOn(vscode.workspace.fs, 'readFile')
        .mockImplementation((uri) =>
          uri.path.endsWith('/other.stanza.md')
            ? Promise.reject(new Error('Access denied'))
            : read(uri),
        );
      try {
        if (cached) await diagnostics.load(new FakeUri('/w/p') as unknown as vscode.Uri);
        newProvider(diagnostics).resolveCustomTextEditor(
          world.document as unknown as vscode.TextDocument,
          fakePanel() as unknown as vscode.WebviewPanel,
        );
        fromWebview({ type: 'ready' });
        await settled(() => {
          expect(world.posted).toContainEqual(
            expect.objectContaining({
              type: 'refused',
              title: 'The project ID index is incomplete',
            }),
          );
        });
        expect(
          world.posted.some((message) => (message as HostMessage).type === 'project-ready'),
        ).toBe(false);
        expect(world.posted).toContainEqual(
          expect.objectContaining({ type: 'init', projectReady: false }),
        );
      } finally {
        spy.mockRestore();
        diagnostics.dispose();
      }
    },
  );
  it('sends a preview, then the project IDs before enabling editing', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toEqual({
      type: 'init',
      documentText: CANONICAL,
      stylesheetText: STYLESHEET,
      defaults: {},
      usedIds: [],
      projectReady: false,
    });
    await settled(() => {
      expect(world.posted).toContainEqual({ type: 'project-ready', usedIds: ['a1b2c3d4e5'] });
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
    open(CANONICAL, '\n', { '/w/p/documents/other.stanza.md': OTHER });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused', canFormat: false });
  });

  it('refuses a project with an error in its stylesheet, and says which', async () => {
    open(CANONICAL, '\n', files({ '/w/p/styles/default.yaml': 'stanza-format: 1\nbad: [' }));
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
    open(CANONICAL, '\n', files({ '/w/p/stanza.yaml': WITH_DEFAULTS }));
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
      const document = { uri: { toString: () => 'project' }, fileName: '/w/p/stanza.yaml' };
      for (const listener of world.changeListeners) listener({ document } as never);
    };
    changeProject();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(posted()).toHaveLength(1);

    world.files.set('/w/p/stanza.yaml', WITH_DEFAULTS);
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

describe('document properties', () => {
  const replies = (): Extract<HostMessage, { type: 'metadata-result' }>[] =>
    posted().filter(
      (message): message is Extract<HostMessage, { type: 'metadata-result' }> =>
        message.type === 'metadata-result',
    );
  async function started(): Promise<void> {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(world.posted).toContainEqual(expect.objectContaining({ type: 'project-ready' }));
    });
  }
  it('applies one metadata edit after queued body typing, leaves the file unsaved, and supports host undo/redo', async () => {
    open(CANONICAL, '\r\n');
    await started();
    const body = CANONICAL.replace('Some text.', 'Unsaved typing.');
    const after = body.replace('title: "T"', 'title: "New title"');
    fromWebview({ type: 'change', text: body });
    fromWebview({ type: 'metadata-change', before: body, text: after });
    await settled(() => {
      expect(world.posted).toContainEqual({
        type: 'metadata-result',
        ok: true,
        message: '',
        text: after,
      });
    });
    expect(world.text).toBe(after);
    expect(world.document?.getText()).toBe(after.replace(/\n/g, '\r\n'));
    expect(world.files.get(DOCUMENT)).toBe(CANONICAL);
    expect(world.saved).toEqual([]);
    expect(world.edits).toHaveLength(2);
    expect(world.edits[1]).toEqual({ start: [2, 0], end: [3, 0], text: 'title: "New title"\n' });
    changeDocument(body, 1);
    await settled(() => {
      expect(world.posted).toContainEqual({ type: 'external-text', text: body, mark: false });
    });
    changeDocument(after, 2);
    await settled(() => {
      expect(world.posted).toContainEqual({ type: 'external-text', text: after, mark: false });
    });
  });

  it('refuses stale drafts, body changes and unsupported metadata without applying them', async () => {
    await started();
    const external = CANONICAL.replace('Some text.', 'External typing.');
    changeDocument(external);
    fromWebview({
      type: 'metadata-change',
      before: CANONICAL,
      text: CANONICAL.replace('title: "T"', 'title: "Draft"'),
    });
    await settled(() => {
      expect(replies().at(-1)?.message).toContain('changed');
    });
    expect(replies().at(-1)?.ok).toBe(false);
    fromWebview({
      type: 'metadata-change',
      before: external,
      text: external.replace('External typing.', 'Smuggled body edit.'),
    });
    await settled(() => {
      expect(replies().at(-1)?.message).toContain('content');
    });
    expect(replies().at(-1)?.ok).toBe(false);
    fromWebview({
      type: 'metadata-change',
      before: external,
      text: external.replace('title: "T"', 'title: [bad]'),
    });
    await settled(() => {
      expect(replies().at(-1)?.message).toContain('canonical');
    });
    expect(replies().at(-1)?.ok).toBe(false);
    expect(world.text).toBe(external);
    expect(world.edits).toEqual([]);
  });

  it('reports failed buffer application instead of accepting the draft', async () => {
    await started();
    world.failEdits = true;
    fromWebview({
      type: 'metadata-change',
      before: CANONICAL,
      text: CANONICAL.replace('title: "T"', 'title: "New"'),
    });
    await settled(() => {
      expect(replies().at(-1)?.message).toContain('not applied');
    });
    expect(replies().at(-1)).toMatchObject({ ok: false, text: CANONICAL });
    expect(world.text).toBe(CANONICAL);
    expect(world.edits).toEqual([]);
  });

  it('resynchronizes an old draft even when the current source was its own last accepted edit', async () => {
    await started();
    const text = CANONICAL.replace('title: "T"', 'title: "Accepted"');
    fromWebview({ type: 'metadata-change', before: CANONICAL, text });
    await settled(() => {
      expect(replies().at(-1)?.ok).toBe(true);
    });
    fromWebview({
      type: 'metadata-change',
      before: CANONICAL,
      text: CANONICAL.replace('title: "T"', 'title: "Stale"'),
    });
    await settled(() => {
      expect(replies().at(-1)?.ok).toBe(false);
    });
    expect(world.posted).toContainEqual({ type: 'external-text', text });
    expect(world.edits).toHaveLength(1);
    expect(world.text).toBe(text);
  });

  it('reports a concurrent change during application and resynchronizes without overwriting it', async () => {
    await started();
    const text = CANONICAL.replace('title: "T"', 'title: "Applied"');
    const concurrent = text.replace('Some text.', 'Concurrent edit.');
    const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
    const spy = vi.spyOn(vscode.workspace, 'applyEdit').mockImplementation(async (edit) => {
      const applied = await apply(edit);
      changeDocument(concurrent);
      return applied;
    });
    try {
      fromWebview({ type: 'metadata-change', before: CANONICAL, text });
      await settled(() => {
        expect(replies().at(-1)?.message).toContain('changed while applying');
      });
      expect(replies().at(-1)).toMatchObject({ ok: false, text: concurrent });
      expect(world.text).toBe(concurrent);
      expect(world.posted).toContainEqual({ type: 'external-text', text: concurrent });
    } finally {
      spy.mockRestore();
    }
  });

  it('sends declared fields initially and refreshes empty/removed declarations; opening their definition does not edit it', async () => {
    const declared = `${PROJECT}metadata-fields:\n  doc-no:\n    type: string\n    required: true\n    label: Document number\n`;
    open(CANONICAL, '\n', files({ '/w/p/stanza.yaml': declared }));
    await started();
    expect(posted()[0]).toMatchObject({
      type: 'init',
      fields: [{ name: 'doc-no', type: 'string', required: true, label: 'Document number' }],
    });
    const changeProject = (text: string): void => {
      world.files.set('/w/p/stanza.yaml', text);
      const document = {
        uri: new FakeUri('/w/p/stanza.yaml'),
        fileName: '/w/p/stanza.yaml',
        getText: () => text,
      };
      for (const listener of world.changeListeners) listener({ document });
    };
    changeProject(`${PROJECT}metadata-fields: {}\n`);
    await settled(() => {
      expect(world.posted).toContainEqual({ type: 'metadata-fields', fields: [] });
    });
    changeProject(PROJECT);
    await settled(() => {
      expect(world.posted).toContainEqual({ type: 'metadata-fields' });
    });
    fromWebview({ type: 'open-project' });
    await settled(() => {
      expect(world.commands).toContain('vscode.open');
    });
    expect(world.commandArgs.at(-1)).toEqual([new FakeUri('/w/p/stanza.yaml')]);
    expect(world.edits).toEqual([]);
    expect(world.files.get('/w/p/stanza.yaml')).toBe(PROJECT);
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
  it('sends an undo and a redo with the flag that says they are not to be marked', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    const undone = CANONICAL.replace('Some text.', 'Undone.');
    changeDocument(undone, 1);
    await settled(() => {
      expect(posted()).toHaveLength(2);
    });
    expect(posted()[1]).toEqual({ type: 'external-text', text: undone, mark: false });
    const redone = CANONICAL.replace('Some text.', 'Redone.');
    changeDocument(redone, 2);
    await settled(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(posted()[2]).toEqual({ type: 'external-text', text: redone, mark: false });
    const agent = CANONICAL.replace('Some text.', 'An agent.');
    changeDocument(agent);
    await settled(() => {
      expect(posted()).toHaveLength(4);
    });
    expect(posted()[3]).toEqual({ type: 'external-text', text: agent });
  });

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
  const ONE = 'documents/one.stanza.md';
  const OTHER_FILE = 'documents/other.stanza.md';

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
        fileName: '/w/p/documents/other.stanza.md',
      };
      for (const listener of world.changeListeners) listener({ document } as never);
    };
    changeOther();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(usages()).toHaveLength(1);

    world.files.set('/w/p/documents/other.stanza.md', `${OTHER}\nA paragraph.\n`);
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
      expect(world.commands).toEqual(['stanza.editStyles']);
    });
  });
});

describe('the diagnostics of the document', () => {
  it('sends none for a document that is in order, after the document', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(diagnosticsPosted()).toHaveLength(1);
    });
    expect(diagnosticsPosted()[0]?.diagnostics).toEqual([]);
  });

  it('sends what the checks say about the blocks of this document, with the path', async () => {
    open(`${FRONT}# No ID\n`);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(diagnosticsPosted()).toHaveLength(1);
    });
    expect(diagnosticsPosted()[0]?.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'missing-id', path: 'blocks[0]' }),
    ]);
  });

  it('leaves out what the checks say about the other documents of the project', async () => {
    open(CANONICAL, '\n', files({ '/w/p/documents/other.stanza.md': `${FRONT}# No ID\n` }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(diagnosticsPosted()).toHaveLength(1);
    });
    expect(diagnosticsPosted()[0]?.diagnostics).toEqual([]);
  });

  it('sends them again when they change, and not when they do not', async () => {
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(diagnosticsPosted()).toHaveLength(1);
    });
    const changeOther = (): void => {
      const document = {
        uri: { toString: () => 'other' },
        fileName: '/w/p/documents/other.stanza.md',
      };
      for (const listener of world.changeListeners) listener({ document } as never);
    };
    changeOther();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(diagnosticsPosted()).toHaveLength(1);

    changeDocument(`${FRONT}# No ID\n`);
    await settled(() => {
      expect(diagnosticsPosted()).toHaveLength(2);
    });
    expect(diagnosticsPosted()[1]?.diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-id' }),
    ]);
  });
});

describe('revealing a block', () => {
  /** Opens a document in a new provider, as the extension does, and returns the provider. */
  function openIn(projectFiles = files()): StanzaEditorProvider {
    reset({ ...projectFiles, [DOCUMENT]: CANONICAL }, DOCUMENT, CANONICAL);
    const provider = newProvider();
    provider.resolveCustomTextEditor(
      world.document as unknown as vscode.TextDocument,
      fakePanel() as unknown as vscode.WebviewPanel,
    );
    return provider;
  }
  const documentUri = (): vscode.Uri => world.document?.uri as unknown as vscode.Uri;
  const reveals = (): HostMessage[] => posted().filter((message) => message.type === 'reveal');

  it('tells the webview of that document to scroll to the block', async () => {
    const provider = openIn();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    provider.reveal(documentUri(), 2);
    await settled(() => {
      expect(reveals()).toEqual([{ type: 'reveal', block: 2 }]);
    });
  });

  it('does nothing for a document that has no editor open, or after the editor is closed', async () => {
    const provider = openIn();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    provider.reveal({ toString: () => 'file:///w/p/documents/other.stanza.md' } as vscode.Uri, 1);
    for (const close of world.disposers) close();
    provider.reveal(documentUri(), 1);
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(reveals()).toEqual([]);
  });

  it('does nothing while the editor shows a refusal', async () => {
    const provider = openIn({ '/w/p/documents/other.stanza.md': OTHER });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ type: 'refused' });
    provider.reveal(documentUri(), 0);
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
  });
});

describe('asking for a reference', () => {
  function openIn(projectFiles = files()): StanzaEditorProvider {
    reset({ ...projectFiles, [DOCUMENT]: CANONICAL }, DOCUMENT, CANONICAL);
    const provider = newProvider();
    provider.resolveCustomTextEditor(
      world.document as unknown as vscode.TextDocument,
      fakePanel() as unknown as vscode.WebviewPanel,
    );
    return provider;
  }
  const documentUri = (): vscode.Uri => world.document?.uri as unknown as vscode.Uri;
  const asked = (): HostMessage[] =>
    posted().filter((message) => message.type === 'make-reference');

  it('tells the webview of that document to open its list of headings', async () => {
    const provider = openIn();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    provider.makeReference(documentUri());
    await settled(() => {
      expect(asked()).toEqual([{ type: 'make-reference' }]);
    });
  });

  it('does nothing while the editor shows a refusal', async () => {
    const provider = openIn({ '/w/p/documents/other.stanza.md': OTHER });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    provider.makeReference(documentUri());
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
  });
});

describe('opening a document at a block', () => {
  const start = (): StanzaEditorProvider => {
    reset({ ...files(), [DOCUMENT]: CANONICAL }, DOCUMENT, CANONICAL);
    return newProvider();
  };
  const documentUri = (): vscode.Uri => world.document?.uri as unknown as vscode.Uri;
  const resolve = (provider: StanzaEditorProvider): void => {
    provider.resolveCustomTextEditor(
      world.document as unknown as vscode.TextDocument,
      fakePanel() as unknown as vscode.WebviewPanel,
    );
  };

  it('keeps the block until the editor is shown, and scrolls to it after the document is sent', async () => {
    const provider = start();
    await provider.open(documentUri(), 2);
    expect(world.commands).toEqual(['vscode.openWith']);
    expect(world.commandArgs[0]?.[1]).toBe('stanza.editor');
    resolve(provider);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted().map((message) => message.type)).toEqual(['init', 'reveal']);
    });
    expect(posted()[1]).toEqual({ type: 'reveal', block: 2 });
  });

  it('scrolls an editor that is open already, and brings it to the front', async () => {
    const provider = start();
    resolve(provider);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    await provider.open(documentUri(), 3);
    await settled(() => {
      expect(posted()[1]).toEqual({ type: 'reveal', block: 3 });
    });
    expect(world.commands).toEqual(['vscode.openWith']);
  });

  it('only shows the document when there is no block', async () => {
    const provider = start();
    await provider.open(documentUri());
    resolve(provider);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]?.type).toBe('init');
  });

  it('does not keep the block for another editor that opens later', async () => {
    const provider = start();
    await provider.open(documentUri(), 2);
    resolve(provider);
    for (const close of world.disposers) close();
    world.posted = [];
    resolve(provider);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted().map((message) => message.type)).toContain('init');
    });
    expect(posted().map((message) => message.type)).not.toContain('reveal');
  });
});

describe('following a reference', () => {
  const source = new FakeUri(DOCUMENT) as unknown as vscode.Uri;
  function start(projectFiles = files()): StanzaEditorProvider {
    reset({ ...projectFiles, [DOCUMENT]: CANONICAL }, DOCUMENT, CANONICAL);
    const provider = newProvider();
    provider.resolveCustomTextEditor(
      world.document as unknown as vscode.TextDocument,
      fakePanel() as unknown as vscode.WebviewPanel,
    );
    return provider;
  }

  it('opens configured scheme URLs externally and reports invalid destinations and opening failures', async () => {
    const provider = start(
      files({
        '/w/p/stanza.yaml': `${PROJECT}link-schemes:\n  jira: https://example.org/browse/{id}\n`,
      }),
    );
    await provider.followReference(source, 'jira://PROJ-123');
    expect(world.opened).toEqual(['https://example.org/browse/PROJ-123']);
    expect(world.errors).toEqual([]);
    await provider.followReference(source, 'unknown://x');
    expect(world.errors.at(-1)).toContain('Unknown link scheme');
    await provider.followReference(source, 'jira://');
    expect(world.errors.at(-1)).toContain('non-empty ID');
    expect(world.opened).toHaveLength(1);
    world.failOpen = true;
    await provider.followReference(source, 'jira://PROJ-456');
    expect(world.errors.at(-1)).toContain('could not open');
    expect(world.edits).toEqual([]);
  });

  it.each(['other.stanza.md#f1e2d3c4b5', 'old-name.stanza.md#f1e2d3c4b5'])(
    'follows %s by ID without rewriting the source',
    async (href) => {
      const targetPath = '/w/p/documents/other.stanza.md';
      const provider = start({ ...files(), [targetPath]: OTHER_WITH_TARGET_AFTER_FIRST });
      fromWebview({ type: 'ready' });
      await settled(() => {
        expect(posted()[0]?.type).toBe('init');
      });
      await provider.followReference(source, href);
      expect(world.commandArgs[0]?.[0]).toMatchObject({ path: targetPath });
      expect(world.text).toBe(CANONICAL);
      expect(world.edits).toEqual([]);
      expect(world.errors).toEqual([]);
    },
  );

  it('opens a file-only destination without inventing a block target', async () => {
    const provider = start();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()[0]?.type).toBe('init');
    });
    await provider.followReference(source, 'other.stanza.md');
    expect(world.commandArgs[0]?.[0]).toMatchObject({ path: '/w/p/documents/other.stanza.md' });
    expect(posted().some((message) => message.type === 'reveal')).toBe(false);
  });

  it.each([
    ['other.stanza.md#zzzzzzzzzz', 'not found'],
    ['other.stanza.md#heading-title', 'immutable block ID'],
    ['../../outside.stanza.md', 'inside this project'],
    ['missing.stanza.md', 'not found'],
  ])('reports %s without falling back to a file or title', async (href, reason) => {
    const provider = start();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()[0]?.type).toBe('init');
    });
    await provider.followReference(source, href);
    expect(world.errors).toHaveLength(1);
    expect(world.errors[0]).toContain(reason);
    expect(world.commands).toEqual([]);
  });

  it('refuses ambiguous IDs, even with a correct-looking filename', async () => {
    const provider = start(files({ '/w/p/documents/duplicate.stanza.md': CANONICAL }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()[0]?.type).toBe('init');
    });
    await provider.followReference(source, 'one.stanza.md#k7m2q9x4zb');
    expect(world.errors[0]).toContain('ambiguous');
    expect(world.commands).toEqual([]);
  });

  it('reuses the validated snapshot until an unsaved project edit invalidates it', async () => {
    const configuration = vi.spyOn(ProjectDiagnostics.prototype, 'configuration');
    try {
      const provider = start();
      fromWebview({ type: 'ready' });
      await settled(() => {
        expect(posted()[0]?.type).toBe('init');
      });
      const initial = configuration.mock.calls.length;
      await provider.followReference(source, '#k7m2q9x4zb');
      await provider.followReference(source, '#k7m2q9x4zb');
      expect(configuration).toHaveBeenCalledTimes(initial);
      changeDocument(CANONICAL.replace('k7m2q9x4zb', 'bbbbbbbbbb'));
      await provider.followReference(source, '#bbbbbbbbbb');
      expect(configuration.mock.calls.length).toBeGreaterThan(initial);
      expect(world.errors).toEqual([]);
    } finally {
      configuration.mockRestore();
    }
  });

  it('reveals a target in the current document', async () => {
    start();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });

    fromWebview({ type: 'follow-reference', target: '#k7m2q9x4zb' });
    await settled(() => {
      expect(posted()).toContainEqual({ type: 'reveal', block: 0 });
      expect(posted()).toContainEqual({ type: 'navigation-finished' });
    });
    expect(world.commands).toEqual(['vscode.openWith']);
  });

  it('opens the target document at the referenced block', async () => {
    const targetPath = '/w/p/documents/other.stanza.md';
    const provider = start({ ...files(), [targetPath]: OTHER_WITH_TARGET_AFTER_FIRST });
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });

    fromWebview({ type: 'follow-reference', target: '#f1e2d3c4b5' });
    await settled(() => {
      expect(world.commands).toEqual(['vscode.openWith']);
    });
    expect(world.commandArgs[0]?.[0]).toMatchObject({ path: targetPath });
    expect(world.commandArgs[0]?.[1]).toBe(StanzaEditorProvider.viewType);

    world.posted = [];
    const targetUri = new FakeUri(targetPath);
    const targetDocument = {
      uri: targetUri,
      fileName: targetPath,
      getText: () => OTHER_WITH_TARGET_AFTER_FIRST,
    } as unknown as vscode.TextDocument;
    provider.resolveCustomTextEditor(targetDocument, fakePanel() as unknown as vscode.WebviewPanel);
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toContainEqual({ type: 'reveal', block: 1 });
    });
  });

  it('reports a reference target that is missing from the project', async () => {
    start();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(posted()).toHaveLength(1);
    });

    fromWebview({ type: 'follow-reference', target: '#zzzzzzzzzz' });
    await settled(() => {
      expect(world.errors).toEqual([
        'Stanza: reference target #zzzzzzzzzz was not found in this project.',
      ]);
    });
    expect(world.commands).toEqual([]);
  });
});

describe('review threads (ADR 0086)', () => {
  const REVIEW = `---
stanza-format: 1
title: "Review of T"
reviews: "documents/one.stanza.md"
---

<!-- stanza: #r1r1r1r1r1 -->
# Review of T

<!-- stanza: #r2r2r2r2r2 -->
## Why this?

On [One](../documents/one.stanza.md#k7m2q9x4zb), at "One".

Status: open. Word comment 2E3C8848.

**Ada Reviewer, 2026-11-21 15:05 UTC:** Why this?
`;

  it('sends the threads of the review documents of the document, and none for a document without', async () => {
    open(CANONICAL, '\n', files({ '/w/p/reviews/one-2026-11-21.stanza.md': REVIEW }));
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(world.posted).toContainEqual(expect.objectContaining({ type: 'review-threads' }));
    });
    const message = (world.posted as HostMessage[]).find((m) => m.type === 'review-threads');
    expect(message).toEqual({
      type: 'review-threads',
      threads: [
        {
          key: 'reviews/one-2026-11-21.stanza.md#r2r2r2r2r2',
          review: 'reviews/one-2026-11-21.stanza.md',
          headingId: 'r2r2r2r2r2',
          title: 'Why this?',
          anchor: 'k7m2q9x4zb',
          quote: { start: 'One' },
          status: 'open',
          wordComment: '2E3C8848',
          comments: [
            {
              author: 'Ada Reviewer',
              time: '2026-11-21 15:05 UTC',
              text: 'Why this?',
              reactions: [],
            },
          ],
          notes: [],
        },
      ],
    });
  });

  it('sends nothing for a document that has no review', async () => {
    open();
    fromWebview({ type: 'ready' });
    await settled(() => {
      expect(world.posted).toContainEqual(expect.objectContaining({ type: 'project-ready' }));
    });
    expect((world.posted as HostMessage[]).some((m) => m.type === 'review-threads')).toBe(false);
  });
});
