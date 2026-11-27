// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHtml } from '../host/html.js';
import type { WebviewMessage } from '../shared/protocol.js';

const STYLESHEET = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../fixtures/example-project/styles/default.yaml',
  ),
  'utf8',
);
const SOURCE = '---\nstanza-format: 1\n---\n\n<!-- stanza: #aaaaaaaaaa -->\n# Heading\n';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('staged webview startup', () => {
  it('paints a read-only preview and only enables editing after project IDs arrive, reporting both painted milestones', async () => {
    const html = buildHtml({ nonce: 'test', scriptUri: 'webview.js', cspSource: 'test:' });
    document.documentElement.innerHTML = new DOMParser().parseFromString(
      html,
      'text/html',
    ).documentElement.innerHTML;
    const sent: WebviewMessage[] = [];
    vi.stubGlobal('acquireVsCodeApi', () => ({
      postMessage: (message: WebviewMessage) => {
        sent.push(message);
      },
      getState: () => undefined,
      setState: () => undefined,
    }));
    let frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const paint = (): void => {
      for (let frame = 0; frame < 2; frame++) {
        const callbacks = frames;
        frames = [];
        for (const callback of callbacks) callback(performance.now());
      }
    };
    await import('./main.js');
    const receive = (message: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: message }));
    };
    receive({
      type: 'init',
      documentText: SOURCE,
      stylesheetText: STYLESHEET,
      defaults: {},
      usedIds: [],
      projectReady: false,
    });
    const content = document.querySelector('.ProseMirror');
    expect(content?.textContent).toContain('Heading');
    expect(content?.getAttribute('contenteditable')).toBe('false');
    expect(document.getElementById('startup-status')?.textContent).toContain('read-only');
    expect(document.querySelector<HTMLFieldSetElement>('#metadata fieldset')?.disabled).toBe(true);
    paint();
    const stages = (): string[] =>
      sent.flatMap((message) => (message.type === 'painted' ? [message.stage] : []));
    expect(stages()).toEqual(['visible']);
    const visible = sent.find((message) => message.type === 'painted');
    if (visible?.type !== 'painted') throw new Error('Nothing was painted.');
    expect(visible.steps?.map((step) => step.name)).toEqual([
      'script',
      'until the document arrived',
      'stylesheet',
      'parse document',
      'properties',
      'editor',
      'pages',
      'toolbar and panels',
      'layout and paint',
    ]);
    expect(visible.at).toBeGreaterThan(performance.timeOrigin);
    receive({ type: 'project-ready', usedIds: ['bbbbbbbbbb'] });
    expect(content?.getAttribute('contenteditable')).toBe('true');
    expect(document.getElementById('startup-status')?.textContent).toBe('');
    paint();
    expect(stages()).toEqual(['visible', 'editable']);
    expect(sent.some((message) => message.type === 'change')).toBe(false);
    const properties = document.getElementById('metadata');
    if (properties === null) throw new Error('No properties panel.');
    const click = (text: string, root: ParentNode = properties): void => {
      const button = [...root.querySelectorAll('button')].find(
        (item) => (item.getAttribute('aria-label') ?? item.textContent) === text,
      );
      if (button === undefined) throw new Error(`Missing button: ${text}`);
      button.click();
    };
    const missingTitle = properties.querySelector('[data-field="title"]');
    if (missingTitle === null) throw new Error('Title was not offered.');
    click('Add Title', missingTitle);
    const title = properties.querySelector<HTMLTextAreaElement>('[aria-label="Title"]');
    if (title === null) throw new Error('No title input.');
    title.value = 'Document title';
    title.dispatchEvent(new Event('input'));
    const styles = document.querySelector<HTMLSelectElement>('[aria-label="Block style"]');
    if (styles === null) throw new Error('No block-style control.');
    styles.value = 'paragraph';
    styles.dispatchEvent(new Event('change'));
    const bodyEdit = SOURCE.replace('# Heading', 'Heading');
    click('Apply');
    const request = sent.find((message) => message.type === 'metadata-change');
    if (request?.type !== 'metadata-change') throw new Error('No metadata request.');
    expect(request.before).toBe(bodyEdit);
    expect(sent.filter((message) => message.type === 'change')).toEqual([
      { type: 'change', text: bodyEdit },
    ]);
    expect(content?.getAttribute('contenteditable')).toBe('false');
    receive({ type: 'metadata-result', ok: true, message: '', text: request.text });
    expect(document.querySelector('.ProseMirror')).toBe(content);
    expect(content?.getAttribute('contenteditable')).toBe('true');
    expect(content?.textContent).toContain('Heading');
    expect(sent.filter((message) => message.type === 'metadata-change')).toHaveLength(1);
    expect(sent.filter((message) => message.type === 'change')).toHaveLength(1);
    receive({ type: 'external-text', text: bodyEdit, mark: false });
    expect(properties.querySelector('[data-field="title"] textarea')).toBeNull();
    expect(content?.textContent).toContain('Heading');
    receive({
      type: 'init',
      documentText: `${SOURCE}\n[Ticket](jira://PROJ-123)\n`,
      stylesheetText: STYLESHEET,
      defaults: {},
      usedIds: [],
      projectReady: true,
      linkSchemes: { jira: 'https://example.org/{id}' },
    });
    const ticket = document.querySelector<HTMLAnchorElement>('.ProseMirror a');
    expect(ticket?.getAttribute('href')).toBe('https://example.org/PROJ-123');
    receive({ type: 'link-schemes', schemes: { jira: 'https://other.example/{id}' } });
    expect(ticket?.getAttribute('href')).toBe('https://other.example/PROJ-123');
    expect(sent.filter((message) => message.type === 'change')).toHaveLength(1);
    receive({ type: 'refused', title: 'Closed', reasons: [], canFormat: false });
  });
});
