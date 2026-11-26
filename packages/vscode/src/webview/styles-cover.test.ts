// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageTemplate, StyleName, Stylesheet } from '@stanza/core';
import { parseStylesheet, setBlock } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { createCoverEditor, heightText, parseHeight, type CoverEditor } from './styles-cover.js';

const BASE = `stanza-format: 1
paragraph-styles:
  body: {}
  heading-1: {}
  heading-2: {}
  heading-3: {}
  heading-4: {}
  heading-5: {}
  heading-6: {}
  code: {}
  list-bulleted: {}
  list-numbered: {}
  cover-title: {}
table-styles:
  table: {}
page-templates:
  page:
    size: A4
`;

const ROWS = `${BASE}    cover:
      margins: { top: 36 }
      rows:
        - height: 100
          content:
            - image: 'assets/logo.png'
              width: 120
        - height: 2fr
          valign: bottom
          content:
            - style: cover-title
              text: '[Untitled](stanza:title)'
        - height: 1fr
`;

let text = BASE;
let editor: CoverEditor;
const sent: StylesWebviewMessage[] = [];
const send = vi.fn((message: StylesWebviewMessage) => {
  sent.push(message);
});

const stylesheetOf = (source: string): Stylesheet => {
  const parsed = parseStylesheet(source);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.stylesheet;
};
const templateOf = (stylesheet: Stylesheet): PageTemplate => {
  const template = stylesheet.pageTemplates.get('page' as StyleName);
  if (template === undefined) throw new Error('No template.');
  return template;
};

/** Shows the text, as the panel does after the host sent it. */
function show(source: string): void {
  text = source;
  const stylesheet = stylesheetOf(source);
  editor.update('page', templateOf(stylesheet), stylesheet);
}

/** Applies what the editor sent last, as the host does, and shows the result. */
function applyLast(): void {
  const message = sent.at(-1);
  if (message?.type !== 'set-block') throw new Error('Nothing was sent.');
  const result = setBlock(text, message.path, message.source ?? undefined);
  if (!result.ok) throw new Error(result.message);
  show(result.text);
}

const buttonOf = (label: string, index = 0): HTMLButtonElement => {
  const found = [...editor.element.querySelectorAll('button')].filter(
    (button) => button.textContent === label || button.title === label,
  )[index];
  if (found === undefined) throw new Error(`No button ${label}.`);
  return found;
};
const change = (field: HTMLInputElement | HTMLSelectElement, value: string): void => {
  field.value = value;
  field.dispatchEvent(new Event('change'));
};
const kindOf = (section: number): HTMLSelectElement => {
  const select = editor.element.querySelectorAll('section')[section]?.querySelector('select');
  if (select === null || select === undefined) throw new Error('No kind.');
  return select;
};

beforeEach(() => {
  sent.length = 0;
  editor = createCoverEditor(send);
  document.body.append(editor.element);
  show(BASE);
});
afterEach(() => {
  document.body.replaceChildren();
});

describe('parseHeight and heightText', () => {
  it('read points, shares and nothing, and write them back', () => {
    for (const [written, height] of [
      ['100', { kind: 'points', pt: 100 }],
      ['2.5fr', { kind: 'share', fr: 2.5 }],
      ['', { kind: 'auto' }],
    ] as const) {
      expect(parseHeight(written)).toEqual(height);
      expect(heightText(height)).toBe(written);
    }
    expect(parseHeight('tall')).toBeUndefined();
  });
});

describe('the cover editor', () => {
  it('makes a cover of rows from nothing, and adds an entry to a row', () => {
    change(kindOf(0), 'rows');
    expect(sent.at(-1)).toEqual({
      type: 'set-block',
      path: ['page-templates', 'page', 'cover'],
      source: 'rows:\n  - content: []',
    });
    applyLast();
    buttonOf('Add a paragraph').click();
    applyLast();
    expect(templateOf(stylesheetOf(text)).cover).toEqual({
      kind: 'rows',
      rows: [
        {
          height: { kind: 'auto' },
          valign: 'top',
          content: [{ kind: 'paragraph', text: [] }],
        },
      ],
    });
  });

  it('writes text with values as links, which the stylesheet reads as tokens', () => {
    change(kindOf(0), 'list');
    applyLast();
    buttonOf('Add a paragraph').click();
    applyLast();
    const input = editor.element.querySelector<HTMLInputElement>('.cover-entry input');
    if (input === null) throw new Error('No text.');
    change(input, 'By [](stanza:authors)');
    applyLast();
    const cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'list' && cover.entries[0]).toEqual({
      kind: 'paragraph',
      text: [
        { kind: 'text', text: 'By ' },
        { kind: 'token', token: 'authors', label: '' },
      ],
    });
  });

  it('changes a height, refuses one it cannot read, and keeps the fields it drew', () => {
    show(ROWS);
    const heights = [
      ...editor.element.querySelectorAll<HTMLInputElement>('.cover-row-box > .row input'),
    ].filter((input) => input.placeholder === 'grows');
    expect(heights.map((input) => input.value)).toEqual(['100', '2fr', '1fr']);
    const first = heights[0];
    if (first === undefined) throw new Error('No height.');
    change(first, 'tall');
    expect(sent).toEqual([]);
    expect(editor.element.querySelector('.status')?.textContent).toContain('is not a height');
    change(first, '120');
    applyLast();
    // The text that came back is what the editor wrote, so the same field is still there.
    expect(first.isConnected).toBe(true);
    const cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'rows' && cover.rows[0]?.height).toEqual({ kind: 'points', pt: 120 });
  });

  it('moves and removes rows, and keeps the entries when a list becomes rows and back', () => {
    show(ROWS);
    buttonOf('Move the row down').click();
    applyLast();
    let cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'rows' && cover.rows.map((row) => row.height.kind)).toEqual([
      'share',
      'points',
      'share',
    ]);
    buttonOf('Remove the row', 2).click();
    applyLast();
    change(kindOf(0), 'list');
    applyLast();
    cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'list' && cover.entries.map((entry) => entry.kind)).toEqual([
      'paragraph',
      'image',
    ]);
    change(kindOf(0), 'none');
    applyLast();
    expect(templateOf(stylesheetOf(text)).cover).toBeUndefined();
  });

  it('sets and clears the margins of the cover, and the width of an image', () => {
    show(ROWS);
    const margin = editor.element.querySelector<HTMLInputElement>('.cover-margins input');
    if (margin === null) throw new Error('No margin.');
    expect(margin.value).toBe('36');
    change(margin, '');
    applyLast();
    let cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'rows' && cover.margins).toBeUndefined();
    const width = [...editor.element.querySelectorAll<HTMLInputElement>('input')].find(
      (input) => input.placeholder === 'own size',
    );
    if (width === undefined) throw new Error('No width.');
    change(width, '');
    applyLast();
    cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'rows' && cover.rows[0]?.content[0]).toEqual({
      kind: 'image',
      path: 'assets/logo.png',
    });
  });

  it('offers the images of the project, and adds a table with the first table style', () => {
    editor.setImages(['assets/a.png', 'assets/b.jpg']);
    expect(
      [...editor.element.querySelectorAll('datalist option')].map((o) => o.textContent),
    ).toEqual(['assets/a.png', 'assets/b.jpg']);
    change(kindOf(1), 'entries');
    applyLast();
    buttonOf('Add an image').click();
    applyLast();
    buttonOf('Add a table of labels and values').click();
    applyLast();
    buttonOf('Add a row of a label and a value').click();
    applyLast();
    expect(templateOf(stylesheetOf(text)).titleBlock).toEqual([
      { kind: 'image', path: 'assets/a.png' },
      { kind: 'table', style: 'table', rows: [{ label: 'Label', value: [] }] },
    ]);
  });

  it('sets and clears the background of a row from the color tokens (ADR 0093)', () => {
    show(
      ROWS.replace(
        'stanza-format: 1\n',
        "stanza-format: 1\ntokens:\n  colors:\n    band: '#17607F'\n",
      ),
    );
    const background = [
      ...editor.element.querySelectorAll<HTMLSelectElement>('.cover-row-box select'),
    ].find((select) => select.title.startsWith('A color token'));
    if (background === undefined) throw new Error('No background.');
    expect([...background.options].map((o) => o.value)).toEqual(['', 'band']);
    change(background, 'band');
    applyLast();
    let cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'rows' && cover.rows[0]?.background).toEqual({
      kind: 'token',
      name: 'band',
    });
    change(background, '');
    applyLast();
    cover = templateOf(stylesheetOf(text)).cover;
    expect(cover?.kind === 'rows' && cover.rows[0]?.background).toBeUndefined();
  });

  it('shows a grid as edited in the text, and does not change it (ADR 0092)', () => {
    show(
      `${BASE}    cover:\n      columns: [1fr, 100]\n      rows: [1fr]\n      areas:\n        - title side\n      area:\n        title:\n          content: []\n`,
    );
    const kind = kindOf(0);
    expect(kind.disabled).toBe(true);
    expect(kind.value).toBe('grid');
    expect(editor.element.textContent).toContain(
      'a grid of 2 columns and 1 rows with the areas title',
    );
    expect(editor.element.querySelectorAll('.cover-row-box')).toHaveLength(0);
    change(kindOf(1), 'entries');
    applyLast();
    expect(templateOf(stylesheetOf(text)).cover?.kind).toBe('grid');
    expect(templateOf(stylesheetOf(text)).titleBlock).toEqual([]);
  });

  it('draws the stylesheet again after a refusal', () => {
    show(ROWS);
    buttonOf('Remove the row').click();
    expect(editor.element.querySelectorAll('.cover-row-box')).toHaveLength(2);
    editor.reset();
    expect(editor.element.querySelectorAll('.cover-row-box')).toHaveLength(3);
  });
});
