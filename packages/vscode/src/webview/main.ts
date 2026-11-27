import { createStanzaEditor, type StanzaEditor } from '@stanza/editor';
import { parseDocument, parseStylesheet, serializeDocument } from '@stanza/format';
import {
  DEFAULT_PAGE_TEMPLATE_NAME,
  isNodeId,
  type Diagnostic,
  type FieldDeclaration,
  type Stylesheet,
} from '@stanza/core';
import {
  parseHostMessage,
  MAX_TEXT_LENGTH,
  type HostMessage,
  type MetadataField,
  type Reason,
  type ReviewThreadView,
  type WebviewMessage,
} from '../shared/protocol.js';
import { createChangesBar } from './changes.js';
import { createNotices } from './notices.js';
import { createMetadataPanel } from './metadata.js';
import { createLinkPrompt } from './link-prompt.js';
import { createReferencePicker } from './reference-picker.js';
import { installReferenceNavigation } from './reference-navigation.js';
import { revealBlock } from './reveal.js';
import { createReviewCards } from './review-cards.js';
import { createReviewRoundBar } from './review-round-bar.js';
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
  document.querySelector('meta[name="stanza-nonce"]')?.getAttribute('content') ?? undefined;

/** Typing is sent after a pause, so that it is one step of the history and not one for a letter. */
const CHANGE_DELAY_MS = 300;

let editor: StanzaEditor | undefined;
let usedIds = new Set<string>();
/** What the checks of the project say about this document, shown on the blocks. */
let inline: readonly Diagnostic[] = [];
/** The threads of the review documents of this document (ADR 0086), as the host sent them. */
let threads: readonly ReviewThreadView[] = [];

/** Whether the resolved threads are shown as well as the open ones (ADR 0086). */
let showResolved = false;

/** Places the threads that are shown in the text, highlights them, and shows their cards. */
function showThreads(): void {
  resolvedButton.hidden = !threads.some((thread) => thread.status === 'resolved');
  if (editor === undefined) {
    reviewCards.show([], []);
    return;
  }
  const shown = threads.filter((thread) => showResolved || thread.status === 'open');
  const placed = editor.setReviewThreads(
    shown.map((thread) => {
      const [first, ...replies] = thread.comments;
      const more = replies.length === 0 ? '' : ` (${String(replies.length)} more)`;
      const label = first === undefined ? thread.title : `${first.author}: ${first.text}${more}`;
      return {
        key: thread.key,
        ...(thread.anchor !== undefined ? { anchor: thread.anchor } : {}),
        ...(thread.position !== undefined ? { position: thread.position } : {}),
        ...(thread.quote !== undefined ? { quote: thread.quote } : {}),
        label,
      };
    }),
  );
  reviewCards.show(shown, placed);
}
/** What the editor holds, as text. What was sent last is the same, unless a send is waiting. */
let lastText = '';
let waiting: ReturnType<typeof setTimeout> | undefined;
/** How many blocks that were removed by changes from outside are not yet dismissed. */
let removedFromOutside = 0;
/** The stages of startup whose paint was reported to the host (ADR 0101). */
const painted = new Set<'visible' | 'editable'>();
let ready = false;
let metadataPending = false;

const fieldMap = (
  fields: readonly MetadataField[] | undefined,
): ReadonlyMap<string, FieldDeclaration> | undefined =>
  fields === undefined ? undefined : new Map(fields.map(({ name, ...field }) => [name, field]));
const templateNames = (sheet: Stylesheet): readonly string[] => [
  ...new Set([DEFAULT_PAGE_TEMPLATE_NAME, ...sheet.pageTemplates.keys()]),
];

/** Tells the host, once per stage, two frames after the content was put in the page. */
function measurePaint(stage: 'visible' | 'editable'): void {
  if (painted.has(stage)) return;
  painted.add(stage);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      send({ type: 'painted', stage });
    });
  });
}

function projectReady(ready: boolean): void {
  setReady(ready);
  element('startup-status').textContent = ready
    ? ''
    : 'Checking project... This preview is read-only.';
  if (ready) {
    element('editor').removeAttribute('aria-busy');
    measurePaint('editable');
  } else element('editor').setAttribute('aria-busy', 'true');
}

function setReady(value: boolean): void {
  ready = value;
  editor?.setEditable(ready && !metadataPending);
  element('toolbar').inert = !ready || metadataPending;
  metadata.update({ editable: ready });
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
const metadata = createMetadataPanel(element('metadata'), {
  apply: (meta) => {
    const result = editor?.getDocument();
    if (!ready || result?.document === undefined) {
      metadata.complete({ ok: false, message: 'The document is not ready for a properties edit.' });
      return;
    }
    const text = serializeDocument({ ...result.document, meta });
    if (lastText.length > MAX_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
      metadata.complete({
        ok: false,
        message: `Properties cannot be applied: the document exceeds ${String(MAX_TEXT_LENGTH)} characters.`,
      });
      return;
    }
    flush();
    metadataPending = true;
    setReady(ready);
    send({ type: 'metadata-change', before: lastText, text });
  },
  openProject: () => {
    send({ type: 'open-project' });
  },
});
const propertiesButton = document.createElement('button');
propertiesButton.textContent = 'Metadata';
propertiesButton.title = 'Show document properties';
propertiesButton.addEventListener('click', () => {
  metadata.open();
});
const resolvedButton = document.createElement('button');
resolvedButton.textContent = 'Resolved';
resolvedButton.title = 'Show the resolved review comments as well';
resolvedButton.setAttribute('aria-pressed', 'false');
resolvedButton.hidden = true;
resolvedButton.addEventListener('click', () => {
  showResolved = !showResolved;
  resolvedButton.setAttribute('aria-pressed', String(showResolved));
  showThreads();
});
/** Push and Pull, and where the review round stands (ADR 0088). */
const reviewRound = createReviewRoundBar(send);
element('toolbar').append(propertiesButton, resolvedButton, reviewRound.element);
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
  titleBlock: element('title-block'),
  header: element('header'),
  footer: element('footer'),
  ...(nonce !== undefined ? { nonce } : {}),
});
const initialView = parseViewState(api.getState());
/** The zoom of the desk, 1 for 100%, which the cards need to be put at the height of their text. */
let zoom = initialView.zoom / 100;
buildViewControls(element('view'), element('desk'), initialView, (state) => {
  api.setState(state);
  zoom = state.zoom / 100;
});
const reviewCards = createReviewCards({
  desk: element('desk'),
  page: element('page'),
  column: element('comments'),
  markers: element('markers'),
  orphans: element('review-orphans'),
  content: element('editor'),
  bar: element('top'),
  editor: () => editor,
  zoom: () => zoom,
  send,
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
  metadataPending = false;
  ready = false;
  editor?.destroy();
  editor = undefined;
  showThreads();
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

function onChange(result: ReturnType<StanzaEditor['getDocument']>): void {
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
  metadataPending = false;
  metadata.complete({ ok: true, meta: parsed.document.meta });
  metadata.update({
    defaults: message.defaults,
    fields: fieldMap(message.fields),
    templates: templateNames(sheet.stylesheet),
  });
  say('');
  refused.hidden = true;
  editing.hidden = false;
  editor = createStanzaEditor({
    element: element('editor'),
    stylesheet: sheet.stylesheet,
    document: parsed.document,
    ...(message.linkSchemes !== undefined ? { linkSchemes: message.linkSchemes } : {}),
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
      reviewCards.schedule();
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
  showThreads();
  toolbar.refresh();
  info.refresh();
  measurePaint('visible');
  projectReady(message.projectReady);
}

function handle(message: HostMessage): void {
  switch (message.type) {
    case 'link-schemes':
      editor?.setLinkSchemes(message.schemes);
      return;
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
      showThreads();
      lastText = serializeDocument(parsed.document);
      pages.update({ document: parsed.document });
      metadata.update({ meta: parsed.document.meta }, true);
      return;
    }
    case 'metadata-fields':
      metadata.update({ fields: fieldMap(message.fields) });
      return;
    case 'metadata-result': {
      if (!metadataPending || editor === undefined) return;
      metadataPending = false;
      if (message.ok) {
        const parsed = parseDocument(message.text);
        if (parsed.diagnostics.length > 0) {
          refuse(
            'The properties result cannot be edited visually',
            parsed.diagnostics.map(reasonOf),
            false,
          );
          return;
        }
        editor.setMetadata(parsed.document.meta);
        lastText = message.text;
        pages.update({ document: parsed.document });
        metadata.complete({ ok: true, meta: parsed.document.meta });
      } else metadata.complete({ ok: false, message: message.message });
      setReady(ready);
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
        metadata.update({ templates: templateNames(sheet.stylesheet) });
      }
      return;
    }
    case 'images':
      pages.update({ images: new Map(Object.entries(message.images)) });
      return;
    case 'defaults':
      pages.update({ defaults: message.defaults });
      metadata.update({ defaults: message.defaults });
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
    case 'review-threads':
      threads = message.threads;
      showThreads();
      return;
    case 'thread-status-done':
      reviewCards.done(message.key);
      return;
    case 'review-round':
      reviewRound.show(message.status, message.folder);
      return;
    case 'review-done':
      reviewRound.done();
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
