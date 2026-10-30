// Throwaway: writes spikes/out/editor-preview.html, the editor on the example project with the
// Markdown it produces next to it, for trying in a browser.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const text = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bundle = await build({
  entryPoints: [new URL('./editor-preview-entry.js', import.meta.url).pathname.replace(/^\//, '')],
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'warning',
});
const code = bundle.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const data = JSON.stringify({
  stylesheet: text('../fixtures/example-project/styles/default.yaml'),
  document: text('../fixtures/example-project/documents/introduction.phrase.md'),
}).replace(/</g, '\\u003c');

const page = `<!doctype html>
<meta charset="utf-8">
<title>Phrase editor preview</title>
<body style="background:#444;margin:0;padding:24px;font-family:sans-serif;display:flex;gap:24px;align-items:flex-start">
<div style="flex:1;max-width:560pt"><div id="toolbar" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px"></div><div id="notices" style="color:#fc6;min-height:1.4em;margin-bottom:8px;font:13px monospace"></div><div id="editor" style="padding:36pt;background:#fff"></div></div>
<pre id="markdown" style="flex:1;background:#222;color:#ddd;padding:12px;white-space:pre-wrap;font:12px/1.4 monospace"></pre>
<script id="data" type="application/json">${data}</script>
<script>${code}</script>
</body>
`;
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/editor-preview.html', import.meta.url), page);
console.log('written spikes/out/editor-preview.html', Math.round(page.length / 1024), 'KB');
