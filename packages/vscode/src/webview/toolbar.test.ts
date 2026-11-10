// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhraseEditor, type CommandResult, type PhraseEditor } from '@phrase/editor';
import type { StyleName } from '@phrase/core';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { buildToolbar, describeContext, type Toolbar } from './toolbar.js';

const STYLES_TEXT = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../fixtures/example-project/styles/default.yaml',
  ),
  'utf8',
).replaceAll('\r\n', '\n');
const stylesheet = parseStylesheet(STYLES_TEXT).stylesheet;

const TEXT = `---
phrase-format: 1
title: "T"
---

<!-- phrase: #k7m2q9x4zb -->
# Title

Some **strong** text.

\`\`\`ts
let x = 1;
\`\`\`

| A | B |
| - | - |
| 1 | 2 |

Plain words.
`;

let toolbar: HTMLElement;
let shown: Toolbar;
let editor: PhraseEditor;
const answered = vi.fn<(command: unknown, result: CommandResult) => void>();

beforeEach(() => {
  const element = document.createElement('div');
  toolbar = document.createElement('div');
  document.body.append(toolbar, element);
  const parsed = parseDocument(TEXT);
  editor = createPhraseEditor({ element, stylesheet, document: parsed.document });
  shown = buildToolbar(toolbar, { editor: () => editor, answered });
  answered.mockClear();
});
afterEach(() => {
  editor.destroy();
  document.body.replaceChildren();
});

const lists = (): { styles: HTMLSelectElement; characters: HTMLSelectElement } => {
  const [styles, characters] = toolbar.querySelectorAll('select');
  if (styles === undefined || characters === undefined) throw new Error('No lists.');
  return { styles, characters };
};
const open = (select: HTMLSelectElement): HTMLOptionElement[] => {
  select.dispatchEvent(new Event('mousedown'));
  return [...select.options];
};
const option = (select: HTMLSelectElement, value: string): HTMLOptionElement => {
  const found = open(select).find((candidate) => candidate.value === value);
  if (found === undefined) throw new Error(`No option ${value}.`);
  return found;
};

const button = (label: string): HTMLButtonElement => {
  const found = toolbar.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`No button ${label}.`);
  return found;
};

describe('the buttons', () => {
  it('have a short form, and the full name for a screen reader', () => {
    expect(button('Bold').textContent).toBe('B');
    expect(button('Italic').textContent).toBe('I');
    expect(button('Bold').classList.contains('look-bold')).toBe(true);
    expect(button('Bulleted list').textContent).toBe('\u22EE');
  });

  it('run their command and hand over the answer', () => {
    editor.setPosition({ block: 1, offset: 2 });
    button('Bold').click();
    expect(answered).toHaveBeenCalledWith({ type: 'toggle-mark', mark: 'strong' }, { ok: true });
  });

  it('are in groups, and the group of the table is shown only in a table', () => {
    const names = [...toolbar.querySelectorAll<HTMLElement>('.group')].map(
      (g) => g.dataset['group'],
    );
    expect(names).toEqual(['text', 'styles', 'lists', 'insert', 'table']);
    const table = toolbar.querySelector<HTMLElement>('[data-group="table"]');
    editor.setPosition({ block: 1, offset: 2 });
    shown.refresh();
    expect(table?.hidden).toBe(true);
    editor.setPosition({ block: 3, offset: 0 });
    shown.refresh();
    expect(table?.hidden).toBe(false);
  });
});

describe('the state at the cursor', () => {
  const stateLine = (): string => describeContext(editor.getContext());

  it('shows the block, its style and the marks that are on', () => {
    editor.setPosition({ block: 0, offset: 1 });
    shown.refresh();
    expect(stateLine()).toBe('Heading 1 | style: default | no marks');
    editor.setPosition({ block: 1, offset: 8 });
    shown.refresh();
    expect(stateLine()).toBe('Paragraph | style: default | strong');
    editor.setPosition({ block: 3, offset: 0 });
    shown.refresh();
    expect(stateLine()).toBe('Table cell | table style: default | no marks');
  });

  it('shows which buttons are on', () => {
    editor.setPosition({ block: 1, offset: 8 });
    shown.refresh();
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
    expect(button('Italic').getAttribute('aria-pressed')).toBe('false');
    expect(button('Code block').getAttribute('aria-pressed')).toBe('false');
    editor.setPosition({ block: 2, offset: 0 });
    shown.refresh();
    expect(button('Code block').getAttribute('aria-pressed')).toBe('true');
  });

  it('disables a command that has no place at the cursor, and says why', () => {
    editor.setPosition({ block: 1, offset: 2 });
    shown.refresh();
    expect(button('Sink list item').disabled).toBe(true);
    expect(button('Italic').disabled).toBe(false);
    editor.setPosition({ block: 3, offset: 0 });
    shown.refresh();
    expect(button('Add row below').disabled).toBe(false);
  });

  it('keeps a command enabled when a variant would allow it, and says what is missing', () => {
    editor.setPosition({ block: 0, offset: 1 });
    shown.refresh();
    const bold = button('Bold');
    expect(bold.disabled).toBe(false);
    expect(bold.classList.contains('needs-variant')).toBe(true);
    expect(bold.title).toContain('does not allow strong');
  });

  it('follows the cursor after a pause, and not for every move', () => {
    vi.useFakeTimers();
    try {
      editor.setPosition({ block: 1, offset: 8 });
      shown.schedule();
      shown.schedule();
      expect(button('Bold').getAttribute('aria-pressed')).toBeNull();
      vi.advanceTimersByTime(200);
      expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the list of the block', () => {
  it('shows the kind of the block, and offers the kinds and then the other styles', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    const values = open(styles).map((o) => o.value);
    expect(values.slice(0, 7)).toEqual([
      'paragraph',
      'heading:1',
      'heading:2',
      'heading:3',
      'heading:4',
      'heading:5',
      'heading:6',
    ]);
    // The styles that the kinds stand for are not offered a second time.
    expect(values).toContain('cover-meta');
    expect(values).not.toContain('heading-2');
    expect(values).not.toContain('body');
    expect(values).not.toContain('table-grid');
    expect(styles.value).toBe('paragraph');
    editor.setPosition({ block: 0, offset: 1 });
    shown.refresh();
    expect(styles.value).toBe('heading:1');
  });

  it('shows a code block, which has no option of its own, without offering to choose it', () => {
    editor.setPosition({ block: 2, offset: 0 });
    shown.refresh();
    const { styles } = lists();
    expect(styles.value).toBe('code-block');
    expect(styles.selectedOptions[0]?.textContent).toBe('Code block');
    expect(styles.selectedOptions[0]?.disabled).toBe(true);
  });

  it('disables a heading that would skip a level, and says why', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    const deep = option(styles, 'heading:3');
    expect(deep.disabled).toBe(true);
    expect(deep.title).toBe(
      'A heading here is at most level 2, one deeper than the heading before it (level 1).',
    );
    expect(option(styles, 'heading:2').disabled).toBe(false);
  });

  it('marks a kind that needs a variant, and still lets it be chosen to get the offer', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    const needing = option(styles, 'heading:1');
    expect(needing.textContent).toBe('Heading 1 (needs strong)');
    expect(needing.disabled).toBe(false);

    styles.value = 'heading:1';
    styles.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenCalledWith(
      { type: 'set-heading', level: 1 },
      expect.objectContaining({
        ok: false,
        fix: { kind: 'declare-variant', style: 'heading-1', mark: 'strong' },
      }),
    );
    // The list shows what the block is, since nothing was changed.
    expect(styles.value).toBe('paragraph');
  });

  it('makes a heading of the block, and a paragraph of it again', () => {
    editor.setPosition({ block: 4, offset: 2 });
    const { styles } = lists();
    open(styles);
    styles.value = 'heading:2';
    styles.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenLastCalledWith({ type: 'set-heading', level: 2 }, { ok: true });
    expect(editor.getContext()).toMatchObject({ block: 'heading', level: 2 });
    expect(styles.value).toBe('heading:2');

    open(styles);
    styles.value = 'paragraph';
    styles.dispatchEvent(new Event('change'));
    expect(editor.getContext().block).toBe('paragraph');
    expect(styles.value).toBe('paragraph');
  });

  it('sets a style that is allowed, and the paragraph option takes it off again', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    open(styles);
    styles.value = 'cover-meta';
    styles.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenCalledWith({ type: 'set-style', style: 'cover-meta' }, { ok: true });
    expect(editor.getContext().style).toBe('cover-meta');
    expect(styles.value).toBe('cover-meta');

    open(styles);
    styles.value = 'paragraph';
    styles.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenLastCalledWith({ type: 'set-paragraph' }, { ok: true });
    expect(editor.getContext().style).toBeUndefined();
    expect(styles.value).toBe('paragraph');
  });

  it('offers the table styles in a table cell', () => {
    editor.setPosition({ block: 3, offset: 0 });
    const values = open(lists().styles).map((o) => o.value);
    expect(values).toEqual(['', 'table', 'table-grid']);
  });
});

describe('the labels of styles', () => {
  it('are shown in place of the names, which stay the values and the commands', () => {
    const labelled = parseStylesheet(
      STYLES_TEXT.replace(
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
        ),
    ).stylesheet;
    const element = document.createElement('div');
    const bar = document.createElement('div');
    document.body.append(bar, element);
    const other = createPhraseEditor({
      element,
      stylesheet: labelled,
      document: parseDocument(TEXT).document,
    });
    try {
      const view = buildToolbar(bar, { editor: () => other, answered });
      const [styles, characters] = bar.querySelectorAll('select');
      if (styles === undefined || characters === undefined) throw new Error('No lists.');
      const shown = (select: HTMLSelectElement): (string | null)[][] =>
        open(select).map((o) => [o.value, o.textContent]);

      other.setPosition({ block: 1, offset: 2 });
      expect(shown(styles)).toContainEqual(['cover-meta', 'Cover details']);
      expect(shown(characters)).toContainEqual(['marker', 'Status marker']);

      expect(other.run({ type: 'set-style', style: 'cover-meta' as StyleName })).toEqual({
        ok: true,
      });
      expect(other.run({ type: 'toggle-character-style', style: 'marker' as StyleName })).toEqual({
        ok: true,
      });
      view.refresh();
      expect(describeContext(other.getContext())).toBe(
        'Paragraph | style: Cover details | Status marker',
      );
      expect(shown(characters)).toContainEqual(['marker', 'Status marker (on)']);

      other.setPosition({ block: 3, offset: 0 });
      expect(shown(styles)).toContainEqual(['table-grid', 'Grid with lines']);
    } finally {
      other.destroy();
    }
  });
});

describe('the list of character styles', () => {
  it('toggles one, shows which are on, and goes back to its heading', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { characters } = lists();
    expect(option(characters, 'marker').textContent).toBe('marker');
    characters.value = 'marker';
    characters.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenCalledWith(
      { type: 'toggle-character-style', style: 'marker' },
      { ok: true },
    );
    expect(characters.value).toBe('');
    expect(option(characters, 'marker').textContent).toBe('marker (on)');
  });

  it('disables what can never be done, as in a code block', () => {
    editor.setPosition({ block: 2, offset: 0 });
    const { characters } = lists();
    const marker = option(characters, 'marker');
    expect(marker.disabled).toBe(true);
    expect(marker.title).toBe('Code blocks take no marks.');
  });
});
