// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhraseEditor, type CommandResult, type PhraseEditor } from '@phrase/editor';
import { parseDocument, parseStylesheet } from '@phrase/format';
import { buildToolbar } from './toolbar.js';

const stylesheet = parseStylesheet(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../fixtures/example-project/styles/default.yaml',
    ),
    'utf8',
  ).replaceAll('\r\n', '\n'),
).stylesheet;

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
`;

let toolbar: HTMLElement;
let editor: PhraseEditor;
const answered = vi.fn<(command: unknown, result: CommandResult) => void>();

beforeEach(() => {
  const element = document.createElement('div');
  toolbar = document.createElement('div');
  document.body.append(toolbar, element);
  const parsed = parseDocument(TEXT);
  editor = createPhraseEditor({ element, stylesheet, document: parsed.document });
  buildToolbar(toolbar, { editor: () => editor, answered });
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

describe('the buttons', () => {
  it('run their command and hand over the answer', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const bold = [...toolbar.querySelectorAll('button')].find((b) => b.textContent === 'Bold');
    bold?.click();
    expect(answered).toHaveBeenCalledWith({ type: 'toggle-mark', mark: 'strong' }, { ok: true });
  });
});

describe('the list of styles', () => {
  it('offers the paragraph styles, with the one the block has', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    const values = open(styles).map((o) => o.value);
    expect(values).toContain('');
    expect(values).toContain('heading-2');
    expect(values).not.toContain('table-grid');
    expect(styles.value).toBe('');
  });

  it('marks a style that needs a variant, and still lets it be chosen to get the offer', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    const needing = option(styles, 'code');
    expect(needing.textContent).toBe('code (needs strong)');
    expect(needing.disabled).toBe(false);
    expect(needing.title).toContain('does not allow');

    styles.value = 'code';
    styles.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenCalledWith(
      { type: 'set-style', style: 'code' },
      expect.objectContaining({
        ok: false,
        fix: { kind: 'declare-variant', style: 'code', mark: 'strong' },
      }),
    );
    // The list shows what the block has, since nothing was changed.
    expect(styles.value).toBe('');
  });

  it('sets a style that is allowed', () => {
    editor.setPosition({ block: 1, offset: 2 });
    const { styles } = lists();
    open(styles);
    styles.value = 'cover-meta';
    styles.dispatchEvent(new Event('change'));
    expect(answered).toHaveBeenCalledWith({ type: 'set-style', style: 'cover-meta' }, { ok: true });
    expect(editor.getContext().style).toBe('cover-meta');
    expect(styles.value).toBe('cover-meta');
  });

  it('offers the table styles in a table cell', () => {
    editor.setPosition({ block: 3, offset: 0 });
    const values = open(lists().styles).map((o) => o.value);
    expect(values).toEqual(['', 'table', 'table-grid']);
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
