// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Document, Stylesheet } from '@phrase/core';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { type FromEditorResult } from './convert.js';
import { createPhraseEditor, type PhraseEditor } from './editor.js';

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

  describe('the state at the cursor', () => {
    const TEXT = `<!-- phrase: #k7m2q9x4zb -->
# Title

Some **strong** text.

| A | B |
| - | - |
| 1 | 2 |
`;

    it('tells the block, its styles, and which marks are on and allowed', () => {
      const api = open(TEXT);
      api.setPosition({ block: 0, offset: 2 });
      expect(api.getContext()).toMatchObject({
        block: 'heading',
        textStyle: 'heading-1',
        marks: {
          strong: { active: false, allowed: false },
          emphasis: { active: false, allowed: true },
        },
      });
      expect(api.getContext().style).toBeUndefined();

      api.setPosition({ block: 1, offset: 7 });
      expect(api.getContext()).toMatchObject({
        block: 'paragraph',
        textStyle: 'body',
        marks: { strong: { active: true, allowed: true }, emphasis: { active: false } },
      });
    });

    it('gives the style of the table for a cell, and what the stylesheet declares', () => {
      const api = open(TEXT);
      api.setPosition({ block: 2, offset: 0 });
      const context = api.getContext();
      expect(context.block).toBe('table-cell');
      expect(context.textStyle).toBe('table-cell');
      expect(context.available.table).toEqual(['table', 'table-grid']);
      expect(context.available.character).toEqual(['marker', 'muted']);
      expect(context.available.paragraph).toContain('body');
    });

    it('tells the character styles that are on', () => {
      const api = open(TEXT);
      api.setPosition({ block: 1, offset: 2 });
      expect(api.getContext().characterStyles).toEqual([]);
      expect(api.run({ type: 'toggle-character-style', style: 'marker' as never })).toEqual({
        ok: true,
      });
      expect(api.getContext().characterStyles).toEqual(['marker']);
    });

    it('checks a command like run does, and changes nothing, not even IDs', () => {
      const onChange = vi.fn();
      const api = open(TEXT, stylesheet, onChange);
      const before = api.getDocument().document;
      api.setPosition({ block: 0, offset: 2 });
      expect(api.check({ type: 'toggle-mark', mark: 'strong' })).toEqual({
        ok: false,
        reason: 'mark-not-allowed',
        message: 'The style "heading-1" does not allow strong.',
        fix: { kind: 'declare-variant', style: 'heading-1', mark: 'strong' },
      });
      expect(api.check({ type: 'toggle-mark', mark: 'emphasis' })).toEqual({ ok: true });
      api.setPosition({ block: 1, offset: 2 });
      expect(api.check({ type: 'set-heading', level: 2 })).toMatchObject({
        ok: false,
        reason: 'marks-not-allowed',
        fix: { kind: 'declare-variant', style: 'heading-2', mark: 'strong' },
      });
      expect(api.getDocument().document).toEqual(before);
      expect(onChange).not.toHaveBeenCalled();
    });
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
