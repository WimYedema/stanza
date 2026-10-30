// Browser side of the editor preview: runs the editor on the sample and shows the Markdown it makes.
import { createPhraseEditor } from '../packages/editor/dist/index.js';
import { parseDocument, parseStylesheet, serializeDocument } from '../packages/format/dist/index.js';

const data = JSON.parse(document.getElementById('data').textContent);
const sheet = parseStylesheet(data.stylesheet);
if (sheet.diagnostics.length > 0) throw new Error(JSON.stringify(sheet.diagnostics));
const parsed = parseDocument(data.document);
if (parsed.diagnostics.length > 0) throw new Error(JSON.stringify(parsed.diagnostics));

const output = document.getElementById('markdown');
const notices = document.getElementById('notices');
const show = (result) => {
  output.textContent =
    result.document === undefined
      ? JSON.stringify(result.diagnostics, null, 2)
      : serializeDocument(result.document);
};
const tell = (text) => {
  notices.textContent = text;
};

const editor = createPhraseEditor({
  element: document.getElementById('editor'),
  stylesheet: sheet.stylesheet,
  document: parsed.document,
  onChange: show,
  onNotice: (notice) => tell(`${notice.code}: ${notice.message}`),
});
show(editor.getDocument());
window.phraseEditor = editor;

const buttons = [
  ['Bold', { type: 'toggle-mark', mark: 'strong' }],
  ['Italic', { type: 'toggle-mark', mark: 'emphasis' }],
  ['Code', { type: 'toggle-mark', mark: 'code' }],
  ['Link', { type: 'set-link', href: 'https://example.org' }],
  ['Unlink', { type: 'remove-link' }],
  ['Marker', { type: 'toggle-character-style', style: 'marker' }],
  ['H1', { type: 'set-heading', level: 1 }],
  ['H2', { type: 'set-heading', level: 2 }],
  ['Paragraph', { type: 'set-paragraph' }],
  ['Cover title', { type: 'set-style', style: 'cover-title' }],
  ['No style', { type: 'set-style', style: null }],
  ['Bullets', { type: 'toggle-list', kind: 'bulleted' }],
  ['Numbers', { type: 'toggle-list', kind: 'numbered' }],
  ['Sink', { type: 'sink-list-item' }],
  ['Lift', { type: 'lift-list-item' }],
  ['Code block', { type: 'toggle-code-block', language: 'ts' }],
  ['Table', { type: 'insert-table', columns: 3, rows: 2 }],
  ['+ Row', { type: 'add-row', where: 'after' }],
  ['+ Column', { type: 'add-column', where: 'after' }],
  ['- Row', { type: 'delete-row' }],
  ['- Column', { type: 'delete-column' }],
  ['Contents', { type: 'insert-phrase-block', kind: 'toc', text: 'depth: 2' }],
];
const toolbar = document.getElementById('toolbar');
for (const [label, command] of buttons) {
  const button = document.createElement('button');
  button.textContent = label;
  // A click must not take the selection away from the editor.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    const result = editor.run(command);
    tell(result.ok ? '' : `${result.reason}: ${result.message}`);
  });
  toolbar.append(button);
}
