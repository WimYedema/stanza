// Throwaway: writes spikes/out/css-preview.html, the example stylesheet applied to sample markup that
// follows the class contract of @phrase/css, for a look in a browser next to the Word sample.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  LIST_CLASS,
  SCOPE_CLASS,
  characterClass,
  compileStylesheetToCss,
  listItemClass,
  markClass,
  paragraphClass,
  tableClass,
} from '../packages/css/dist/index.js';
import { parseStylesheet } from '../packages/format/dist/index.js';

const text = readFileSync(new URL('../fixtures/example-project/styles/default.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const { stylesheet } = parseStylesheet(text);
const { css, diagnostics } = compileStylesheetToCss(stylesheet);
if (css === undefined) throw new Error(JSON.stringify(diagnostics));

const p = (name, html) => `<p class="${paragraphClass(name)}">${html}</p>`;
const h = (level, html) => `<h${level} class="${paragraphClass(`heading-${level}`)}">${html}</h${level}>`;
const strong = (html) => `<strong class="${markClass('strong')}">${html}</strong>`;
const em = (html) => `<em class="${markClass('emphasis')}">${html}</em>`;
const code = (html) => `<code class="${markClass('code')}">${html}</code>`;
const link = (html) => `<a href="#" class="${markClass('link')}">${html}</a>`;
const marker = (html) => `<span class="${characterClass('marker')}">${html}</span>`;
const item = (style, html, nested = '') => `<li class="${listItemClass(style)}">${html}${nested}</li>`;

const body = [
  p('cover-title', 'Export sample'),
  h(1, '1 Heading with ' + em('emphasis') + ' and ' + marker('marker')),
  p('body', `Body text with ${strong('strong')}, ${em('emphasis')}, ${code('code')} and a ${link('link')}. `.repeat(4)),
  h(2, '1.1 Second level'),
  `<ul class="${LIST_CLASS}">${item('list-bulleted', 'First item', `<ul class="${LIST_CLASS}">${item('list-bulleted', 'Nested item')}</ul>`)}${item('list-bulleted', 'Second item')}</ul>`,
  `<ol class="${LIST_CLASS}">${item('list-numbered', 'One')}${item('list-numbered', 'Two')}</ol>`,
  `<pre class="${paragraphClass('code')}">let x = 1;\nlet y = 2;</pre>`,
  `<table class="${tableClass('table-grid')}"><thead><tr><th>${p('table-cell', 'Name')}</th><th>${p('table-cell', 'Value')}</th></tr></thead><tbody><tr><td>${p('table-cell', 'Alpha')}</td><td>${p('table-cell', '1')}</td></tr><tr><td>${p('table-cell', 'Beta')}</td><td>${p('table-cell', '2')}</td></tr></tbody></table>`,
  h(1, '2 Another first level'),
  p('body', 'Closing paragraph.'),
].join('\n');

const page = `<!doctype html>
<meta charset="utf-8">
<title>Phrase CSS preview</title>
<body style="background:#444;margin:0;padding:24px;font-family:sans-serif">
<style>${css}</style>
<div class="${SCOPE_CLASS}" style="max-width:480pt;margin:0 auto;padding:48pt">
${body}
</div>
</body>
`;
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/css-preview.html', import.meta.url), page);
console.log('written spikes/out/css-preview.html', css.length, 'bytes of CSS');
