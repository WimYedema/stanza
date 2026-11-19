// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Document, Stylesheet } from '@phrase/core';
import { parseDocument, parseStylesheet, serializeDocument } from '@phrase/format';
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
  it('receives metadata without replacing blocks or selection, and retains it on subsequent edits', () => {
    const changed = vi.fn<(result: FromEditorResult) => void>();
    const api = open(undefined, stylesheet, changed);
    api.setPosition({ block: 1, offset: 4 });
    const position = api.getPosition();
    const block = api.blockElement(1);
    const blocks = api.getDocument().document?.blocks;
    const meta = { title: 'Updated', authors: [], fields: { code: '0012', tags: ['a', ''] } };
    api.setMetadata(meta);
    expect(api.blockElement(1)).toBe(block);
    expect(api.getPosition()).toEqual(position);
    expect(api.getDocument().document).toEqual({ meta, blocks });
    expect(changed).not.toHaveBeenCalled();
    api.setPosition({ block: 0, offset: 4 });
    expect(api.run({ type: 'set-paragraph' })).toEqual({ ok: true });
    expect(changed.mock.lastCall?.[0].document?.meta).toEqual(meta);
    api.setDocument(documentOf(SAMPLE), { cursor: 'at-change' });
    expect(api.getDocument().document?.meta.title).toBe('T');
  });
  it('gates commands and keyboard transactions in a preview, then enables editing without losing the selection', () => {
    const changed = vi.fn();
    const ids = vi.fn(() => 'bbbbbbbbbb');
    editor = createPhraseEditor({
      element,
      stylesheet,
      document: documentOf('<!-- phrase: #aaaaaaaaaa -->\n# Heading\n'),
      editable: false,
      newId: ids,
      onChange: changed,
    });
    const before = editor.getDocument();
    editor.setPosition({ block: 0, offset: 3 });
    const position = editor.getPosition();
    expect(editor.run({ type: 'set-paragraph' })).toMatchObject({
      ok: false,
      reason: 'not-applicable',
    });
    element
      .querySelector('.ProseMirror')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    expect(editor.getDocument()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    expect(ids).not.toHaveBeenCalled();
    editor.setEditable(true);
    expect(editor.getPosition()).toEqual(position);
    expect(editor.run({ type: 'set-paragraph' })).toEqual({ ok: true });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(editor.getDocument().document?.blocks[0]?.type).toBe('paragraph');
  });
  it('can be made a view that only shows the content', () => {
    editor = createPhraseEditor({
      element,
      stylesheet,
      document: documentOf('Some text.\n'),
      editable: false,
    });
    expect(element.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false');
    editor.destroy();
    editor = createPhraseEditor({ element, stylesheet, document: documentOf('Some text.\n') });
    expect(element.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true');
  });

  it('says what is selected, and gives the focus back to the content', () => {
    const api = open('Some text.\n');
    api.setPosition({ block: 0, offset: 2 });
    expect(api.getSelectedText()).toBe('');
    api.focus();
    expect(document.activeElement).toBe(element.querySelector('.ProseMirror'));
  });

  it('says where the link at the cursor goes', () => {
    const api = open('Some [text](https://example.org/a) here.\n');
    api.setPosition({ block: 0, offset: 2 });
    expect(api.getLinkHref()).toBeUndefined();
    api.setPosition({ block: 0, offset: 7 });
    expect(api.getLinkHref()).toBe('https://example.org/a');
  });

  it('inserts a reference at the cursor, as a link to the block', () => {
    const api = open('Some text.\n');
    api.setPosition({ block: 0, offset: 5 });
    expect(api.run({ type: 'set-reference', id: 'k7m2q9x4zb', text: 'I5' })).toEqual({ ok: true });
    const text = serializeDocument(api.getDocument().document ?? documentOf(''));
    expect(text).toContain('Some [I5](#k7m2q9x4zb)text.');
  });

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
    expect(classOf('td > p')).toContain('phrase-p-table-cell');
    expect(classOf('th > p')).toContain('phrase-p-table-cell');
    expect(classOf('td')).toBeNull();
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

  it('writes no inline style, and shows a table of contents as a labelled box with its entries', () => {
    open();
    expect(element.querySelectorAll('[style]')).toHaveLength(0);
    const box = element.querySelector('.phrase-block');
    expect(box?.querySelector('.phrase-block-label')?.textContent).toBe(
      'Table of contents (down to level 2, page numbers added by Word)',
    );
    expect(
      [...(box?.querySelectorAll('p') ?? [])].map((p) => [p.className, p.textContent]),
    ).toEqual([['phrase-p-toc-1', '1 Title']]);
  });

  describe('a table of contents', () => {
    const TOC = (depth: number): string =>
      `# One\n\nText\n\n\`\`\`phrase-toc\ndepth: ${String(depth)}\n\`\`\`\n`;
    const entries = (): (string | null)[] =>
      [...element.querySelectorAll('.phrase-block p')].map((p) => p.textContent);

    it('lists the headings down to its depth, with their numbers', () => {
      open(`${TOC(2)}\n## Two\n\n### Three\n`);
      expect(entries()).toEqual(['1 One', '1.1 Two']);
      editor?.destroy();
      open(`${TOC(1)}\n## Two\n`);
      expect(entries()).toEqual(['1 One']);
    });

    it('follows the headings while they are edited', () => {
      const api = open(TOC(2));
      expect(entries()).toEqual(['1 One']);
      api.setPosition({ block: 1, offset: 1 });
      expect(api.run({ type: 'set-heading', level: 2 })).toEqual({ ok: true });
      expect(entries()).toEqual(['1 One', '1.1 Text']);
    });

    it('says when there is nothing to list', () => {
      open('Text\n\n```phrase-toc\n```\n');
      expect(entries()).toEqual([]);
      expect(element.querySelector('.phrase-block-empty')?.textContent).toBe('No headings yet.');
    });

    it('follows a new stylesheet', () => {
      const api = open(TOC(2));
      const label = (): string | null | undefined =>
        element.querySelector('.phrase-block-label')?.textContent;
      expect(label()).toContain('page numbers added by Word');
      expect(api.setStylesheet({ ...stylesheet, tableOfContents: { pageNumbers: false } })).toEqual(
        [],
      );
      expect(label()).toBe('Table of contents (down to level 2)');
    });

    it('names any other kind of block as it is', () => {
      open('Text\n\n```phrase-foo\nbody\n```\n');
      expect(element.querySelector('.phrase-block')?.textContent).toBe('Phrase block "foo"');
    });
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

  describe('the element of a block', () => {
    it('is the element drawn for the top-level block, by its number', () => {
      const api = open('# Title\n\nSome text.\n\n- item\n\n| A |\n| - |\n| 1 |\n', stylesheet);
      expect(api.blockElement(0)?.tagName).toBe('H1');
      expect(api.blockElement(1)?.textContent).toBe('Some text.');
      expect(api.blockElement(2)?.tagName).toBe('UL');
      expect(api.blockElement(3)?.tagName).toBe('TABLE');
    });

    it('is undefined for a number that is not a block', () => {
      const api = open('Only this.\n', stylesheet);
      expect(api.blockElement(1)).toBeUndefined();
      expect(api.blockElement(-1)).toBeUndefined();
    });
  });

  describe('replacing the content with the cursor at the change', () => {
    const THREE = 'First.\n\nSecond one.\n\nThird.\n';

    it('puts the cursor after the text that is new, as after a redo', () => {
      const api = open(THREE, stylesheet);
      api.setPosition({ block: 0, offset: 2 });
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'), { cursor: 'at-change' });
      expect(api.getPosition()).toEqual({ block: 1, offset: 'Second big '.length });
    });

    it('puts the cursor where the text was taken out, as after an undo', () => {
      const api = open('First.\n\nSecond big one.\n\nThird.\n', stylesheet);
      api.setPosition({ block: 2, offset: 3 });
      api.setDocument(documentOf(THREE), { cursor: 'at-change' });
      expect(api.getPosition()).toEqual({ block: 1, offset: 'Second '.length });
    });

    it('keeps the cursor where it was when nothing changed', () => {
      const api = open(THREE, stylesheet);
      api.setPosition({ block: 2, offset: 3 });
      api.setDocument(documentOf(THREE), { cursor: 'at-change' });
      expect(api.getPosition()).toEqual({ block: 2, offset: 3 });
    });

    it('does not move the cursor on its own without the option', () => {
      const api = open(THREE, stylesheet);
      api.setPosition({ block: 2, offset: 3 });
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'));
      expect(api.getPosition()).not.toEqual({ block: 1, offset: 'Second big '.length });
    });
  });

  describe('changes from outside', () => {
    const THREE = 'First.\n\nSecond one.\n\nThird.\n';
    const marked = (): string[] =>
      [...element.querySelectorAll('.phrase-changed')].map((node) => node.textContent);

    it('marks a block that is different, and counts it as changed and one as removed', () => {
      const api = open(THREE, stylesheet);
      const change = api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'), {
        markChanges: true,
      });
      expect(change).toEqual({ changed: 1, removed: 1 });
      expect(api.changedBlocks()).toEqual([1]);
      expect(marked()).toEqual(['Second big one.']);
    });

    it('marks a block that is new, and counts a block that is gone', () => {
      const api = open(THREE, stylesheet);
      expect(api.setDocument(documentOf(`${THREE}\nFourth.\n`), { markChanges: true })).toEqual({
        changed: 1,
        removed: 0,
      });
      expect(marked()).toEqual(['Fourth.']);
      expect(
        api.setDocument(documentOf('First.\n\nThird.\n\nFourth.\n'), { markChanges: true }),
      ).toEqual({
        changed: 0,
        removed: 1,
      });
    });

    it('marks nothing when the content is the same, or when it is not asked for', () => {
      const api = open(THREE, stylesheet);
      expect(api.setDocument(documentOf(THREE), { markChanges: true })).toEqual({
        changed: 0,
        removed: 0,
      });
      expect(api.changedBlocks()).toEqual([]);
      expect(api.setDocument(documentOf('First.\n\nChanged.\n\nThird.\n'))).toEqual({
        changed: 0,
        removed: 0,
      });
      expect(marked()).toEqual([]);
    });

    it('adds up over several changes, with the marks following their blocks', () => {
      const api = open(THREE, stylesheet);
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'), { markChanges: true });
      api.setDocument(documentOf('New start.\n\nFirst.\n\nSecond big one.\n\nThird.\n'), {
        markChanges: true,
      });
      expect(api.changedBlocks()).toEqual([0, 2]);
      expect(marked()).toEqual(['New start.', 'Second big one.']);
    });

    it('keeps the marks that are there when a change is not marked, as after an undo', () => {
      const api = open(THREE, stylesheet);
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'), { markChanges: true });
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird, undone.\n'));
      expect(marked()).toEqual(['Second big one.']);
    });

    it('drops the mark of a block that is gone, and clears all on request', () => {
      const api = open(THREE, stylesheet);
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'), { markChanges: true });
      api.setDocument(documentOf('First.\n\nThird.\n'));
      expect(api.changedBlocks()).toEqual([]);
      api.setDocument(documentOf('First.\n\nOther.\n'), { markChanges: true });
      expect(api.changedBlocks()).toEqual([1]);
      api.clearChanges();
      expect(api.changedBlocks()).toEqual([]);
      expect(marked()).toEqual([]);
    });

    it('does not put the marks in the content', () => {
      const api = open(THREE, stylesheet);
      api.setDocument(documentOf('First.\n\nSecond big one.\n\nThird.\n'), { markChanges: true });
      expect(api.getDocument().document?.blocks).toHaveLength(3);
      expect(JSON.stringify(api.getDocument().document)).not.toContain('phrase-changed');
    });
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
      expect(context.inTable).toBe(true);
      expect(context.textStyle).toBe('table-cell');
      expect(context.available.table).toEqual(['table', 'table-grid']);
      expect(context.available.character).toEqual(['marker', 'muted']);
      expect(context.available.paragraph).toContain('body');
    });

    it('gives the labels of the styles that have one, by kind', () => {
      const source = read('example-project/styles/default.yaml')
        .replace(
          '  cover-meta:\n    based-on: body',
          "  cover-meta:\n    label: 'Cover details'\n    based-on: body",
        )
        .replace(
          '  marker:\n    bold: true',
          "  marker:\n    label: 'Status marker'\n    bold: true",
        )
        .replace(
          '  table-grid:\n    based-on: table',
          "  table-grid:\n    label: 'Grid with lines'\n    based-on: table",
        );
      const sheet = parseStylesheet(source);
      expect(sheet.diagnostics).toEqual([]);
      const api = open(TEXT, sheet.stylesheet);
      const { labels } = api.getContext();
      expect([...labels.paragraph]).toEqual([['cover-meta', 'Cover details']]);
      expect([...labels.character]).toEqual([['marker', 'Status marker']]);
      expect([...labels.table]).toEqual([['table-grid', 'Grid with lines']]);
      expect(api.getContext().available.paragraph).toContain('cover-meta');
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

    it('tells the level of a heading and the kind of list', () => {
      const api = open(SAMPLE);
      api.setPosition({ block: 0, offset: 0 });
      expect(api.getContext()).toMatchObject({ block: 'heading', level: 1, list: undefined });
      api.setPosition({ block: 2, offset: 1 });
      expect(api.getContext()).toMatchObject({
        block: 'paragraph',
        level: undefined,
        list: 'bulleted',
      });
      api.setPosition({ block: 3, offset: 0 });
      expect(api.getContext().list).toBeUndefined();
      api.setPosition({ block: 1, offset: 0 });
      expect(api.getContext().list).toBeUndefined();
    });

    it('tells when the cursor moved, a change was made, or the stylesheet changed', () => {
      const onContextChange = vi.fn();
      editor = createPhraseEditor({
        element,
        stylesheet,
        document: documentOf(TEXT),
        onContextChange,
      });
      editor.setPosition({ block: 1, offset: 2 });
      expect(onContextChange).toHaveBeenCalledTimes(1);
      editor.run({ type: 'toggle-mark', mark: 'emphasis' });
      expect(onContextChange).toHaveBeenCalledTimes(2);
      editor.setStylesheet(stylesheet);
      expect(onContextChange).toHaveBeenCalledTimes(3);
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
    expect(classOf('td > p')).toContain('phrase-p-code');
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
    expect(classOf('td > p')).toContain('phrase-p-table-cell');
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
