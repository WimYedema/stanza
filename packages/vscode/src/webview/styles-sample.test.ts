// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStanzaEditor, type StanzaEditor } from '@stanza/editor';
import { parseStylesheet } from '@stanza/format';
import type { Entry } from './styles-families.js';
import { FOCUS_CLASS, focusSample, sampleDocument, sampleSelector } from './styles-sample.js';

const SOURCE = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../fixtures/example-project/styles/default.yaml',
  ),
  'utf8',
).replaceAll('\r\n', '\n');
const stylesheet = parseStylesheet(SOURCE).stylesheet;

const entry = (kind: Entry['kind'], family: Entry['family'], name: string): Entry => ({
  kind,
  family,
  name,
  label: undefined,
  basedOn: undefined,
});

describe('sampleDocument', () => {
  const sample = sampleDocument(stylesheet);
  const styles = (type: string): unknown[] =>
    sample.blocks
      .filter((block) => block.type === type)
      .map((block) => (block as { style?: unknown }).style);

  it('has a heading of every level, in an outline that does not skip one', () => {
    const levels = sample.blocks.flatMap((block) =>
      block.type === 'heading' ? [block.level] : [],
    );
    expect(levels).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has a paragraph for each paragraph style that no other part of it shows', () => {
    const shown = styles('paragraph').filter((style) => style !== undefined);
    expect(shown).toEqual([
      'table-cell',
      'header-footer',
      'toc-1',
      'toc-2',
      'toc-3',
      'cover-title',
      'cover-meta',
    ]);
  });

  it('has a table for each table style, and the character styles in a paragraph', () => {
    expect(styles('table')).toEqual(['table', 'table-grid']);
    const characters = sample.blocks
      .flatMap((block) => (block.type === 'paragraph' ? block.content : []))
      .flatMap((inline) => inline.marks)
      .flatMap((mark) => (mark.type === 'style' ? [mark.name] : []));
    expect(characters).toEqual(['marker', 'muted']);
  });

  it('has lists, a code block, and a table of contents', () => {
    expect(sample.blocks.map((block) => block.type)).toEqual(
      expect.arrayContaining(['list', 'code', 'stanza']),
    );
  });

  it('shows the label of a style in place of its name', () => {
    const labelled = parseStylesheet(
      SOURCE.replace(
        '  cover-meta:\n    based-on: body',
        "  cover-meta:\n    label: 'Cover details'\n    based-on: body",
      ),
    ).stylesheet;
    const found = sampleDocument(labelled).blocks.find(
      (block) => block.type === 'paragraph' && block.style === 'cover-meta',
    );
    expect(found?.type === 'paragraph' && found.content[0]?.text).toBe(
      'Cover details: a paragraph of this style.',
    );
  });
});

describe('the sample in the editor', () => {
  let root: HTMLElement;
  let editor: StanzaEditor;

  beforeEach(() => {
    // The test environment does not scroll.
    Element.prototype.scrollIntoView = vi.fn();
    root = document.createElement('div');
    document.body.append(root);
    editor = createStanzaEditor({
      element: root,
      stylesheet,
      document: sampleDocument(stylesheet),
      editable: false,
    });
  });
  afterEach(() => {
    editor.destroy();
    document.body.replaceChildren();
  });

  it('is shown and cannot be edited', () => {
    expect(root.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false');
    expect(root.querySelector('h1')?.textContent).toBe('1Sample document');
    expect(root.querySelector('h1 .stanza-heading-number')?.textContent).toBe('1');
    expect(root.querySelector('.stanza-p-cover-title')?.textContent).toContain('cover-title');
  });

  it('marks what an entry looks like, and moves the mark when another is chosen', () => {
    focusSample(root, entry('paragraph-style', 'paragraphs', 'cover-title'));
    expect([...root.querySelectorAll(`.${FOCUS_CLASS}`)].map((e) => e.className)).toEqual([
      expect.stringContaining('stanza-p-cover-title'),
    ]);
    focusSample(root, entry('character-style', 'characters', 'marker'));
    const marked = [...root.querySelectorAll(`.${FOCUS_CLASS}`)];
    expect(marked).toHaveLength(1);
    expect(marked[0]?.className).toContain('stanza-c-marker');
    focusSample(root, entry('table-style', 'tables', 'table-grid'));
    expect(root.querySelector('table.stanza-t-table-grid')?.classList.contains(FOCUS_CLASS)).toBe(
      true,
    );
    focusSample(root, entry('paragraph-style', 'lists', 'list-bulleted'));
    expect(root.querySelector('li.stanza-li-list-bulleted')?.classList.contains(FOCUS_CLASS)).toBe(
      true,
    );
  });

  it('marks nothing for no entry, or for one that is not in the sample', () => {
    focusSample(root, entry('paragraph-style', 'paragraphs', 'cover-title'));
    focusSample(root, undefined);
    expect(root.querySelectorAll(`.${FOCUS_CLASS}`)).toHaveLength(0);
    focusSample(root, entry('color', 'theme', 'brand'));
    expect(root.querySelectorAll(`.${FOCUS_CLASS}`)).toHaveLength(0);
  });
});

describe('sampleSelector', () => {
  it('names the class that the editor gives what the entry is', () => {
    expect(sampleSelector(entry('paragraph-style', 'headings', 'heading-2'))).toBe(
      '.stanza-p-heading-2',
    );
    expect(sampleSelector(entry('paragraph-style', 'lists', 'list-numbered'))).toBe(
      '.stanza-li-list-numbered',
    );
    expect(sampleSelector(entry('page-part', 'pages', 'cover'))).toBeUndefined();
  });
});
