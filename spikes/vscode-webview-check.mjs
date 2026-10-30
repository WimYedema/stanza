// Throwaway: writes spikes/out/vscode-webview-check.html, the page of the VS Code editor with a stub
// for the VS Code API, so that the webview can be tried in a browser. It uses the real page and its
// content security policy. `window.__sent` has what the webview sent, and `window.__host(message)`
// plays a message of the extension host.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const text = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../packages/vscode/src/host/html.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { buildHtml } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const nonce = 'checknonce123';
const html = buildHtml({
  scriptUri: '../../packages/vscode/dist/webview.js',
  nonce,
  cspSource: 'file:',
});
const fixtures = JSON.stringify({
  stylesheet: text('../fixtures/example-project/styles/default.yaml'),
  document: text('../fixtures/example-project/documents/introduction.phrase.md'),
}).replace(/</g, '\\u003c');
const stub = `<script nonce="${nonce}">
window.__sent = [];
window.__csp = [];
window.__fixtures = ${fixtures};
window.acquireVsCodeApi = () => ({ postMessage: (message) => { window.__sent.push(message); } });
window.__host = (message) => window.postMessage(message, '*');
document.addEventListener('securitypolicyviolation', (event) => {
  window.__csp.push(event.violatedDirective + ' ' + event.blockedURI);
});
</script>`;
const page = html.replace(`<script nonce="${nonce}" src=`, `${stub}\n<script nonce="${nonce}" src=`);
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/vscode-webview-check.html', import.meta.url), page);
console.log('written spikes/out/vscode-webview-check.html');
