import { describe, expect, it } from 'vitest';
import { buildHtml } from './html.js';

const html = buildHtml({
  scriptUri: 'vscode-resource://x/webview.js',
  nonce: 'abc123',
  cspSource: 'vscode-resource:',
});

describe('buildHtml', () => {
  it('allows only scripts and styles that carry the nonce, and nothing remote', () => {
    const policy = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'nonce-abc123'");
    expect(policy).toContain("style-src 'nonce-abc123'");
    expect(policy).not.toMatch(/unsafe|https?:|\*/);
  });

  it('names the shared chunks in the head, with the nonce, so they are fetched with the script', () => {
    const page = buildHtml({
      scriptUri: 'vscode-resource://x/webview.js',
      nonce: 'abc123',
      cspSource: 'vscode-resource:',
      preloadUris: ['vscode-resource://x/chunk-A.js'],
    });
    const head = page.slice(0, page.indexOf('</head>'));
    expect(head).toContain(
      '<link rel="modulepreload" nonce="abc123" href="vscode-resource://x/chunk-A.js">',
    );
    expect(html).not.toContain('modulepreload');
  });

  it('gives every script and style element the nonce, and writes no inline style attribute', () => {
    for (const tag of html.match(/<(script|style)\b[^>]*>/g) ?? []) {
      expect(tag).toContain('nonce="abc123"');
    }
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).toContain('src="vscode-resource://x/webview.js"');
  });

  it('gives the page for the editor and the page for a refused file', () => {
    expect(html).toContain('id="editor"');
    expect(html).toContain('id="refused"');
  });
});
