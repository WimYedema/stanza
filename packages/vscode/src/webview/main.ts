import { createPhraseEditor, type PhraseEditor } from '@phrase/editor';
import { parseDocument, parseStylesheet, serializeDocument } from '@phrase/format';
import { isNodeId, type Diagnostic } from '@phrase/core';
import {
  parseHostMessage,
  type HostMessage,
  type Reason,
  type WebviewMessage,
} from '../shared/protocol.js';
import { createChangesBar } from './changes.js';
import { createNotices } from './notices.js';
import { createLinkPrompt } from './link-prompt.js';
import { createReferencePicker } from './reference-picker.js';
import { installReferenceNavigation } from './reference-navigation.js';
import { revealBlock } from './reveal.js';
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
/** What the checks of the project say about this document, shown on the blocks. */
let inline: readonly Diagnostic[] = [];
/** What the editor holds, as text. What was sent last is the same, unless a send is waiting. */
let lastText = '';
let waiting: ReturnType<typeof setTimeout> | undefined;
/** How many blocks that were removed by changes from outside are not yet dismissed. */
let removedFromOutside = 0;
let visibleMs: number | undefined;
let editableMs: number | undefined;
let timed = false;

function measurePaint(kind: 'visible' | 'editable'): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (kind === 'visible') visibleMs ??= Math.round(performance.now());
      else editableMs ??= Math.round(performance.now());
      if (!timed && visibleMs !== undefined && editableMs !== undefined) {
        timed = true;
        send({ type: 'startup-timing', visibleMs, editableMs });
      }
    });
  });
}

function projectReady(ready: boolean): void {
  editor?.setEditable(ready);
  element('toolbar').inert = !ready;
  element('startup-status').textContent = ready
    ? ''
    : 'Checking project... This preview is read-only.';
  if (ready) {
    element('editor').removeAttribute('aria-busy');
    measurePaint('editable');
  } else element('editor').setAttribute('aria-busy', 'true');
}

const { say, answered, declared } = createNotices(notices, send, (command) => editor?.run(command));
const navigation = installReferenceNavigation(
  element('editor'),
  (target) => {
    flush();
    send({ type: 'follow-reference', target });
  },
  (message) => {
    element('navigation-status').textContent = message;
  },
);
const references = createReferencePicker(element('references'), {
  editor: () => editor,
  answered,
});
const links = createLinkPrompt(element('links'), { editor: () => editor, answered });
const toolbar = buildToolbar(element('toolbar'), {
  editor: () => editor,
  answered,
  makeReference: () => {
    references.open();
  },
  editLink: () => {
    links.open();
  },
});
const info = createStyleInfo({
  root: element('info'),
  editor: () => editor,
  edit: (kind, name) => {
    send({ type: 'edit-styles', style: { kind, name } });
  },
});
const changes = createChangesBar(element('changes'), {
  next: () => {
    if (editor === undefined) return;
    const marked = editor.changedBlocks();
    const here = editor.getPosition().block;
    const target = marked.find((block) => block > here) ?? marked[0];
    if (target !== undefined) revealBlock(editor, target, element('top'));
  },
  dismiss: () => {
    editor?.clearChanges();
    removedFromOutside = 0;
    showChanges();
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

function showChanges(): void {
  changes.show(editor?.changedBlocks().length ?? 0, removedFromOutside);
}

function flush(): void {
  if (waiting === undefined) return;
  clearTimeout(waiting);
  waiting = undefined;
  send({ type: 'change', text: lastText });
}

function refuse(title: string, reasons: readonly Reason[], canFormat: boolean): void {
  element('startup-status').textContent = '';
  clearTimeout(waiting);
  waiting = undefined;
  editor?.destroy();
  editor = undefined;
  references.close();
  links.close();
  removedFromOutside = 0;
  showChanges();
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
  removedFromOutside = 0;
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
    onReferenceTrigger: () => {
      references.open({ replaces: '@' });
    },
    usedIds: () => usedIds,
    editable: message.projectReady,
    onContextChange: () => {
      toolbar.schedule();
      info.schedule();
      showChanges();
    },
    ...(nonce !== undefined ? { styleNonce: nonce } : {}),
  });
  pages.update({
    stylesheet: sheet.stylesheet,
    defaults: message.defaults,
    document: parsed.document,
  });
  info.setStylesheet(sheet.stylesheet);
  editor.setDiagnostics(inline);
  toolbar.refresh();
  info.refresh();
  measurePaint('visible');
  projectReady(message.projectReady);
}

function handle(message: HostMessage): void {
  switch (message.type) {
    case 'init':
      start(message);
      return;
    case 'project-ready':
      usedIds = new Set(message.usedIds);
      projectReady(true);
      toolbar.refresh();
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
      const change = editor.setDocument(parsed.document, {
        cursor: 'at-change',
        markChanges: message.mark !== false,
      });
      removedFromOutside += change.removed;
      showChanges();
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
    case 'reveal':
      if (editor !== undefined) revealBlock(editor, message.block, element('top'));
      return;
    case 'make-reference':
      references.open();
      return;
    case 'navigation-finished':
      navigation.finish();
      return;
    case 'usage':
      info.setUsage(message.usage);
      return;
    case 'diagnostics':
      inline = message.diagnostics.map((entry) => ({
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        ...(entry.path !== undefined ? { path: entry.path } : {}),
        ...(entry.nodeId !== undefined && isNodeId(entry.nodeId) ? { nodeId: entry.nodeId } : {}),
      }));
      editor?.setDiagnostics(inline);
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
