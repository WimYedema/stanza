// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildHtml } from './html.js';

/** Some of the styles that VS Code puts in every webview, with the colours of a dark theme. */
const VSCODE_DEFAULTS = `
  code { color: rgb(206, 145, 120); background-color: rgb(30, 30, 30); padding: 1px 3px; border-radius: 4px; }
  pre { background-color: rgb(30, 30, 30); }
  blockquote { background: rgb(40, 40, 40); }
`;

describe('the page in a dark theme', () => {
  it('keeps the document in the colours of its stylesheet, inline code and code blocks included', () => {
    const page = buildHtml({ scriptUri: 'x.js', nonce: 'n', cspSource: 'c' });
    document.documentElement.innerHTML = page.replace(/^<!DOCTYPE html>\s*/i, '');
    const defaults = document.createElement('style');
    defaults.textContent = VSCODE_DEFAULTS;
    // VS Code adds its styles before those of the page.
    document.head.prepend(defaults);
    const stylesheet = document.createElement('style');
    stylesheet.textContent =
      '.stanza-document { color: rgb(0, 0, 0); background-color: rgb(255, 255, 255); }' +
      '.stanza-document .stanza-p-code { background-color: rgb(242, 242, 242); }';
    document.head.append(stylesheet);
    const sheet = document.createElement('div');
    sheet.className = 'stanza-document';
    sheet.innerHTML =
      '<p class="stanza-p-body">Run <code class="stanza-m-code">npm test</code>.</p>' +
      '<pre class="stanza-p-code">npm run check</pre>';
    document.body.append(sheet);

    const inline = getComputedStyle(sheet.querySelector('code') as Element);
    expect(inline.color).toBe('rgb(0, 0, 0)');
    expect(inline.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    const block = getComputedStyle(sheet.querySelector('pre') as Element);
    expect(block.color).toBe('rgb(0, 0, 0)');
    // The background the code style sets wins over the reset.
    expect(block.backgroundColor).toBe('rgb(242, 242, 242)');
  });
});
