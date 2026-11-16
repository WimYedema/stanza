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
const SOURCE = '---\nphrase-format: 1\n---\n\n<!-- phrase: #aaaaaaaaaa -->\n# Heading\n';

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
    paint();
    expect(sent.some((message) => message.type === 'startup-timing')).toBe(false);
    receive({ type: 'project-ready', usedIds: ['bbbbbbbbbb'] });
    expect(content?.getAttribute('contenteditable')).toBe('true');
    expect(document.getElementById('startup-status')?.textContent).toBe('');
    paint();
    const timing = sent.find((message) => message.type === 'startup-timing');
    if (timing?.type !== 'startup-timing') throw new Error('No startup timings were reported.');
    expect(timing.visibleMs).toBeGreaterThanOrEqual(0);
    expect(timing.editableMs).toBeGreaterThanOrEqual(timing.visibleMs);
    expect(sent.some((message) => message.type === 'change')).toBe(false);
    receive({ type: 'refused', title: 'Closed', reasons: [], canFormat: false });
  });
});
