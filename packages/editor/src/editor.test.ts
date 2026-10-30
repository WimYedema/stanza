// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Document, Stylesheet } from '@phrase/core';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { type FromEditorResult } from './convert.js';
import { createPhraseEditor, type PhraseEditor } from './editor.js';
import { schemaExtensions } from './schema.js';
import { UniqueIds } from './unique-ids.js';

const read = (path: string): string =>
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures', path),
    'utf8',
  ).replace(/\r\n/g, '\n');

const stylesheet = parseStylesheet(read('example-project/styles/default.yaml')).stylesheet;

function documentOf(body: string): Document {
  const parsed = parseDocument(`---\nphrase-format: 1\ntitle: "T"\n---\n\n${body}`);
  expect(parsed.diagnostics).toEqual([]);
  return parsed.document;
}

const SAMPLE = `<!-- phrase: #k7m2q9x4zb -->
# Title

Some **strong** and *emphasis* text with <span class="marker">marked</span> words.

- first
- second

  Continued.

  - nested

<!-- phrase: .note -->
A note.

\`\`\`ts
let x = 1;
\`\`\`

| A | B |
| - | - |
| 1 | 2 |

\`\`\`phrase-toc
depth: 2
\`\`\`
`;

let element: HTMLElement;
let editor: PhraseEditor | undefined;

beforeEach(() => {
  element = document.createElement('div');
  document.body.append(element);
});
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  element.remove();
});

function open(
  body = SAMPLE,
  sheet: Stylesheet = stylesheet,
  onChange?: (result: FromEditorResult) => void,
): PhraseEditor {
  editor = createPhraseEditor({
    element,
    stylesheet: sheet,
    document: documentOf(body),
    ...(onChange !== undefined ? { onChange } : {}),
  });
  return editor;
}

const classOf = (selector: string): string | null =>
  element.querySelector(selector)?.getAttribute('class') ?? null;

describe('createPhraseEditor', () => {
  it('scopes the editor and writes the stylesheet next to it', () => {
    open();
    const root = element.querySelector('.ProseMirror');
    expect(root?.classList.contains('phrase-document')).toBe(true);
    const css = element.querySelector('style')?.textContent ?? '';
    expect(css).toContain('.phrase-document .phrase-p-heading-1 {');
    expect(css).toContain('.phrase-block');
    // The text of a list item has no class, so the browser's margins are reset for it.
    expect(css).toContain('li > p:not([class])');
  });

  it('gives each block the class of its style, the default style included', () => {
    open();
    expect(classOf('h1')).toContain('phrase-p-heading-1');
    expect(classOf('.ProseMirror > p')).toContain('phrase-p-body');
    expect(classOf('p.phrase-p-note')).not.toBeNull();
    expect(classOf('pre')).toContain('phrase-p-code');
    expect(classOf('table')).toContain('phrase-t-table');
    expect(classOf('td')).toContain('phrase-p-table-cell');
    expect(classOf('th')).toContain('phrase-p-table-cell');
    expect(classOf('ul')).toBe('phrase-list');
  });

  it('lets a list item take its look from its list, and its text carry no class', () => {
    open();
    const items = [...element.querySelectorAll('li')];
    expect(items.map((li) => li.getAttribute('class'))).toEqual([
      'phrase-li-list-bulleted',
      'phrase-li-list-bulleted',
      'phrase-li-list-bulleted',
    ]);
    expect([...element.querySelectorAll('li > p')].map((p) => p.getAttribute('class'))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('writes marks and character styles with their classes, in the order of the model', () => {
    open();
    expect(classOf('strong')).toBe('phrase-m-strong');
    expect(classOf('em')).toBe('phrase-m-emphasis');
    expect(classOf('span.phrase-c-marker')).toBe('phrase-c-marker');
  });

  it('writes no inline style, and shows a phrase block as a labelled box', () => {
    open();
    expect(element.querySelectorAll('[style]')).toHaveLength(0);
    expect(element.querySelector('.phrase-block')?.textContent).toBe('phrase-toc');
  });

  it('gives back the document it was given, with its metadata', () => {
    const api = open();
    const result = api.getDocument();
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toEqual(documentOf(SAMPLE));
  });

  it('reports a change made in the editor with the document it now holds', async () => {
    const results: FromEditorResult[] = [];
    open('A paragraph.\n', stylesheet, (result) => results.push(result));
    const text = [...(element.querySelector('.ProseMirror > p')?.childNodes ?? [])][0];
    if (text === undefined) throw new Error('No text.');
    text.textContent = 'A changed paragraph.';
    await vi.waitFor(() => {
      expect(results.length).toBeGreaterThan(0);
    });
    const last = results.at(-1)?.document;
    expect(last?.blocks).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'A changed paragraph.', marks: [] }] },
    ]);
    expect(last?.meta.title).toBe('T');
  });

  it('replaces the content without calling onChange', () => {
    const onChange = vi.fn();
    const api = open(SAMPLE, stylesheet, onChange);
    api.setDocument(documentOf('Only this.\n'));
    expect(element.querySelectorAll('.ProseMirror > *')).toHaveLength(1);
    expect(api.getDocument().document?.blocks).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies a new stylesheet to the CSS and to the classes', () => {
    const api = open();
    const roomy: Stylesheet = {
      ...stylesheet,
      tableStyles: new Map([
        ...stylesheet.tableStyles,
        [
          'table' as never,
          { ...(stylesheet.tableStyles.get('table' as never) ?? {}), cellStyle: 'code' as never },
        ],
      ]),
    };
    expect(api.setStylesheet(roomy)).toEqual([]);
    expect(classOf('td')).toContain('phrase-p-code');
    expect(element.querySelector('style')?.textContent).toContain('.phrase-t-table');
  });

  it('refuses a stylesheet with errors, and keeps the one in force', () => {
    const api = open();
    const before = element.querySelector('style')?.textContent;
    const broken: Stylesheet = {
      ...stylesheet,
      paragraphStyles: new Map([...stylesheet.paragraphStyles].filter(([name]) => name !== 'code')),
    };
    expect(api.setStylesheet(broken).length).toBeGreaterThan(0);
    expect(element.querySelector('style')?.textContent).toBe(before);
    expect(classOf('td')).toContain('phrase-p-table-cell');
  });

  it('refuses to start with a stylesheet that has errors', () => {
    const broken: Stylesheet = {
      ...stylesheet,
      paragraphStyles: new Map([...stylesheet.paragraphStyles].filter(([name]) => name !== 'code')),
    };
    expect(() =>
      createPhraseEditor({ element, stylesheet: broken, document: documentOf('x\n') }),
    ).toThrow('The stylesheet has errors');
  });
});

describe('IDs in the editor', () => {
  it('keeps the ID on the first part of a block that is split, and gives the rest none', () => {
    const tiptap = new Editor({
      element,
      extensions: [...schemaExtensions(), UniqueIds],
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, id: 'k7m2q9x4zb', style: 'note' },
            content: [{ type: 'text', text: 'Title' }],
          },
        ],
      },
    });
    tiptap.commands.setTextSelection(3);
    expect(tiptap.commands.splitBlock()).toBe(true);
    const [first, second] = tiptap.state.doc.children;
    expect(first?.attrs).toMatchObject({ id: 'k7m2q9x4zb', style: 'note', level: 2 });
    expect(second?.attrs['id']).toBeNull();
    expect(second?.attrs['style']).toBe('note');
    tiptap.destroy();
  });
});
