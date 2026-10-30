// Browser side of the editor preview: runs the editor on the sample and shows the Markdown it makes.
import { createPhraseEditor } from '../packages/editor/dist/index.js';
import { parseDocument, parseStylesheet, serializeDocument } from '../packages/format/dist/index.js';

const data = JSON.parse(document.getElementById('data').textContent);
const sheet = parseStylesheet(data.stylesheet);
if (sheet.diagnostics.length > 0) throw new Error(JSON.stringify(sheet.diagnostics));
const parsed = parseDocument(data.document);
if (parsed.diagnostics.length > 0) throw new Error(JSON.stringify(parsed.diagnostics));

const output = document.getElementById('markdown');
const show = (result) => {
  output.textContent =
    result.document === undefined
      ? JSON.stringify(result.diagnostics, null, 2)
      : serializeDocument(result.document);
};

const editor = createPhraseEditor({
  element: document.getElementById('editor'),
  stylesheet: sheet.stylesheet,
  document: parsed.document,
  onChange: show,
});
show(editor.getDocument());
window.phraseEditor = editor;
