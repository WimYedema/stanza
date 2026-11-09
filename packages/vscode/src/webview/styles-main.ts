import { createPhraseEditor, type PhraseEditor } from '@phrase/editor';
import { parseStylesheet } from '@phrase/format';
import type { Diagnostic, Stylesheet } from '@phrase/core';
import type { Reason } from '../shared/protocol.js';
import {
  parseStylesHostMessage,
  type StylesHostMessage,
  type StylesWebviewMessage,
} from '../shared/styles-protocol.js';
import { createPanel } from './styles-panel.js';
import { createPagePanel } from './styles-pages.js';
import { focusSample, sampleDocument } from './styles-sample.js';
import { createThemePanel } from './styles-theme.js';
import { createStylesView } from './styles-view.js';
import { showRefused } from './views.js';

/**
 * The webview of the style editor (ADR 0036). It gets the text of the stylesheet from the extension
 * host, reads it, lists the styles by family, draws a sample document with the compiled CSS, and
 * shows the panel of a paragraph style, whose changes go back to the host as edits of the text.
 */

const api = acquireVsCodeApi();
const send = (message: StylesWebviewMessage): void => {
  api.postMessage(message);
};

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`The page has no #${id}.`);
  return found;
}

const studio = element('studio');
const refused = element('refused');
const problems = element('problems');
const sample = element('sample');
const nonce =
  document.querySelector('meta[name="phrase-nonce"]')?.getAttribute('content') ?? undefined;

let editor: PhraseEditor | undefined;
let latest: Stylesheet | undefined;

const detail = element('detail');
const panel = createPanel({ root: element('panel'), send });
const theme = createThemePanel({ root: element('theme'), send });
const pages = createPagePanel({ root: element('pages'), send });

const view = createStylesView(
  { tabs: element('tabs'), list: element('list'), detail },
  (entry, family) => {
    focusSample(sample, entry);
    if (latest === undefined) return;
    const shown = [
      panel.show(entry, latest),
      theme.show(entry, family, latest),
      pages.show(entry, latest),
    ];
    detail.hidden = shown.includes(true);
  },
);

const reasonOf = (diagnostic: Diagnostic): Reason => ({
  message: `${diagnostic.message}${diagnostic.path === undefined ? '' : ` [${diagnostic.path}]`}`,
  ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
});

function refuse(title: string, reasons: readonly Reason[]): void {
  editor?.destroy();
  editor = undefined;
  studio.hidden = true;
  refused.hidden = false;
  showRefused(refused, title, reasons, false, {
    format: () => undefined,
    openAsText: () => {
      send({ type: 'open-as-text' });
    },
  });
}

/** Shows a stylesheet. One with errors is not shown as a stylesheet: it replaces nothing that was shown. */
function show(text: string): void {
  const parsed = parseStylesheet(text);
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    if (editor === undefined) {
      refuse('The stylesheet has errors', errors.map(reasonOf));
      return;
    }
    problems.hidden = false;
    problems.textContent = `The stylesheet has errors, so what is shown is the last one without: ${errors
      .slice(0, 3)
      .map((error) => error.message)
      .join(' ')}`;
    return;
  }
  problems.hidden = true;
  refused.hidden = true;
  studio.hidden = false;
  const sampleDoc = sampleDocument(parsed.stylesheet);
  latest = parsed.stylesheet;
  if (editor === undefined) {
    editor = createPhraseEditor({
      element: sample,
      stylesheet: parsed.stylesheet,
      document: sampleDoc,
      editable: false,
      ...(nonce !== undefined ? { styleNonce: nonce } : {}),
    });
  } else {
    editor.setStylesheet(parsed.stylesheet);
    editor.setDocument(sampleDoc);
  }
  view.show(parsed.stylesheet);
}

function handle(message: StylesHostMessage): void {
  switch (message.type) {
    case 'init':
    case 'text':
      show(message.text);
      return;
    case 'refused':
      refuse(message.title, message.reasons);
      return;
    case 'edit-refused':
      panel.refused(message.message);
      theme.refused(message.message);
      pages.refused(message.message);
      return;
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = parseStylesHostMessage(event.data);
  if (message !== undefined) handle(message);
});

send({ type: 'ready' });
