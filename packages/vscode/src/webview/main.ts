import { createPhraseEditor, type PhraseEditor } from '@phrase/editor';
import { parseDocument, parseStylesheet, serializeDocument } from '@phrase/format';
import type { Diagnostic } from '@phrase/core';
import {
  parseHostMessage,
  type HostMessage,
  type Reason,
  type WebviewMessage,
} from '../shared/protocol.js';
import { createNotices } from './notices.js';
import { createSheet } from './sheet.js';
import { createStyleInfo } from './style-info.js';
import { buildToolbar } from './toolbar.js';
import { buildViewControls, parseViewState } from './view.js';
import { showRefused } from './views.js';

/**
 * The webview of the editor (ADR 0025). It gets the text of the document and of the stylesheet from
 * the extension host, parses them, and runs the editor. A change is serialized and sent back as the
 * whole text, and the host applies only the lines that differ.
 */

const api = acquireVsCodeApi();
const send = (message: WebviewMessage): void => {
  api.postMessage(message);
};

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`The page has no #${id}.`);
  return found;
}

const editing = element('editing');
const refused = element('refused');
const notices = element('notices');
const nonce =
  document.querySelector('meta[name="phrase-nonce"]')?.getAttribute('content') ?? undefined;

/** Typing is sent after a pause, so that it is one step of the history and not one for a letter. */
const CHANGE_DELAY_MS = 300;

let editor: PhraseEditor | undefined;
let usedIds = new Set<string>();
/** What the editor holds, as text. What was sent last is the same, unless a send is waiting. */
let lastText = '';
let waiting: ReturnType<typeof setTimeout> | undefined;

const { say, answered, declared } = createNotices(notices, send, (command) => editor?.run(command));
const toolbar = buildToolbar(element('toolbar'), { editor: () => editor, answered });
const info = createStyleInfo({
  root: element('info'),
  editor: () => editor,
  edit: () => {
    send({ type: 'edit-styles' });
  },
});
const pages = createSheet({
  cover: element('cover'),
  header: element('header'),
  footer: element('footer'),
  ...(nonce !== undefined ? { nonce } : {}),
});
buildViewControls(element('view'), element('desk'), parseViewState(api.getState()), (state) => {
  api.setState(state);
});

const reasonOf = (diagnostic: Diagnostic): Reason => ({
  message: `${diagnostic.message}${diagnostic.path === undefined ? '' : ` [${diagnostic.path}]`}`,
  ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
});

function flush(): void {
  if (waiting === undefined) return;
  clearTimeout(waiting);
  waiting = undefined;
  send({ type: 'change', text: lastText });
}

function refuse(title: string, reasons: readonly Reason[], canFormat: boolean): void {
  clearTimeout(waiting);
  waiting = undefined;
  editor?.destroy();
  editor = undefined;
  info.refresh();
  editing.hidden = true;
  refused.hidden = false;
  showRefused(refused, title, reasons, canFormat, {
    format: () => {
      send({ type: 'format' });
    },
    openAsText: () => {
      send({ type: 'open-as-text' });
    },
  });
}

function onChange(result: ReturnType<PhraseEditor['getDocument']>): void {
  if (result.document === undefined) {
    say(`The content cannot be saved: ${result.diagnostics.map((d) => d.message).join(' ')}`);
    return;
  }
  const text = serializeDocument(result.document);
  if (text === lastText) return;
  lastText = text;
  pages.update({ document: result.document });
  clearTimeout(waiting);
  waiting = setTimeout(flush, CHANGE_DELAY_MS);
}

function start(message: Extract<HostMessage, { type: 'init' }>): void {
  const sheet = parseStylesheet(message.stylesheetText);
  const errors = sheet.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    refuse('The stylesheet has errors', errors.map(reasonOf), false);
    return;
  }
  const parsed = parseDocument(message.documentText);
  if (parsed.diagnostics.length > 0) {
    refuse('This file cannot be edited visually', parsed.diagnostics.map(reasonOf), false);
    return;
  }
  editor?.destroy();
  element('editor').replaceChildren();
  usedIds = new Set(message.usedIds);
  lastText = serializeDocument(parsed.document);
  say('');
  refused.hidden = true;
  editing.hidden = false;
  editor = createPhraseEditor({
    element: element('editor'),
    stylesheet: sheet.stylesheet,
    document: parsed.document,
    onChange,
    onNotice: (notice) => {
      say(`${notice.code}: ${notice.message}`);
    },
    usedIds: () => usedIds,
    onContextChange: () => {
      toolbar.schedule();
      info.schedule();
    },
    ...(nonce !== undefined ? { styleNonce: nonce } : {}),
  });
  pages.update({
    stylesheet: sheet.stylesheet,
    defaults: message.defaults,
    document: parsed.document,
  });
  info.setStylesheet(sheet.stylesheet);
  toolbar.refresh();
  info.refresh();
}

function handle(message: HostMessage): void {
  switch (message.type) {
    case 'init':
      start(message);
      return;
    case 'external-text': {
      if (editor === undefined) return;
      const parsed = parseDocument(message.text);
      if (parsed.diagnostics.length > 0) {
        refuse('This file cannot be edited visually', parsed.diagnostics.map(reasonOf), false);
        return;
      }
      // The text that came in is newer than anything that was waiting to be sent.
      clearTimeout(waiting);
      waiting = undefined;
      const position = editor.getPosition();
      editor.setDocument(parsed.document);
      editor.setPosition(position);
      lastText = serializeDocument(parsed.document);
      pages.update({ document: parsed.document });
      return;
    }
    case 'stylesheet': {
      const sheet = parseStylesheet(message.text);
      const errors = sheet.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        say(`The stylesheet has errors: ${errors.map((d) => d.message).join(' ')}`);
        return;
      }
      const problems = editor?.setStylesheet(sheet.stylesheet) ?? [];
      say(problems.map((d) => d.message).join(' '));
      if (editor !== undefined && problems.every((d) => d.severity !== 'error')) {
        pages.update({ stylesheet: sheet.stylesheet });
        info.setStylesheet(sheet.stylesheet);
        info.refresh();
      }
      return;
    }
    case 'defaults':
      pages.update({ defaults: message.defaults });
      return;
    case 'used-ids':
      usedIds = new Set(message.ids);
      return;
    case 'usage':
      info.setUsage(message.usage);
      return;
    case 'declared':
      declared(message.ok, message.message);
      return;
    case 'refused':
      refuse(message.title, message.reasons, message.canFormat);
      return;
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = parseHostMessage(event.data);
  if (message !== undefined) handle(message);
});

// A webview that is hidden or closed may not get to run a timer, so what waits is sent at once.
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flush();
});

// A link in a document is for the reader of the output. In the editor it must not take the page away.
element('editor').addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a') !== null) event.preventDefault();
});

// Undo and redo belong to the history of the document in VS Code, which gets the key. The browser's
// own undo of the page must not run as well.
document.addEventListener(
  'keydown',
  (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault();
    }
  },
  true,
);

send({ type: 'ready' });
