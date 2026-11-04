import { describe, expect, it } from 'vitest';
import { buildStylesHtml } from './styles-html.js';

const html = buildStylesHtml({
  scriptUri: 'vscode-resource://x/styles.js',
  nonce: 'abc123',
  cspSource: 'vscode-resource:',
});

describe('buildStylesHtml', () => {
  it('allows only scripts and styles that carry the nonce, and nothing remote', () => {
    const policy = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'nonce-abc123'");
    expect(policy).toContain("style-src 'nonce-abc123'");
    expect(policy).not.toMatch(/unsafe|https?:|\*/);
  });

  it('gives every script and style element the nonce, and writes no inline style attribute', () => {
    for (const tag of html.match(/<(script|style)\b[^>]*>/g) ?? []) {
      expect(tag).toContain('nonce="abc123"');
    }
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).toContain('src="vscode-resource://x/styles.js"');
  });

  it('has the parts that the script looks for', () => {
    for (const id of [
      'studio',
      'tabs',
      'list',
      'detail',
      'panel',
      'problems',
      'sample',
      'refused',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
