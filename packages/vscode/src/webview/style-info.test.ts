// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhraseEditor, type PhraseEditor } from '@phrase/editor';
import { parseDocument, parseStylesheet } from '@phrase/format';
import type { UsageSummary } from '../shared/protocol.js';
import { createStyleInfo, type StyleInfo } from './style-info.js';

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

Some text.

| A | B |
| - | - |
| 1 | 2 |
`;

const usage: UsageSummary = {
  current: 'documents/one.phrase.md',
  paragraph: {
    body: [
      { file: 'documents/one.phrase.md', direct: 0, default: 3, inherited: 5 },
      { file: 'documents/two.phrase.md', direct: 1, default: 1, inherited: 0 },
    ],
    'heading-1': [{ file: 'documents/two.phrase.md', direct: 0, default: 2, inherited: 0 }],
  },
  character: {},
  table: {},
};

let root: HTMLElement;
let editor: PhraseEditor;
let info: StyleInfo;
let present = true;
const edit = vi.fn<() => void>();

beforeEach(() => {
  root = document.createElement('div');
  const element = document.createElement('div');
  document.body.append(root, element);
  editor = createPhraseEditor({
    element,
    stylesheet,
    document: parseDocument(TEXT).document,
  });
  info = createStyleInfo({ root, editor: () => (present ? editor : undefined), edit });
  present = true;
  info.setStylesheet(stylesheet);
  edit.mockClear();
});
afterEach(() => {
  editor.destroy();
  document.body.replaceChildren();
});

const at = (block: number, offset = 0): void => {
  editor.setPosition({ block, offset });
  info.refresh();
};
const text = (): string => root.textContent;
const rows = (): Record<string, string | undefined> =>
  Object.fromEntries(
    [...root.querySelectorAll('dt')].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]),
  );

describe('the style at the cursor', () => {
  it('names the paragraph style of the block, and is hidden where there is none', () => {
    at(1, 2);
    expect(root.hidden).toBe(false);
    expect(root.querySelector('summary')?.textContent).toBe('Style: body');
    expect(text()).toContain('Paragraph style body');
    present = false;
    info.refresh();
    expect(root.hidden).toBe(true);
  });

  it('shows the style with its bases applied, and where a value comes from', () => {
    at(0, 1);
    const shown = rows();
    expect(root.querySelector('summary')?.textContent).toBe('Style: heading-1');
    expect(shown['Bold']).toBe('yes');
    expect(shown['Size']).toMatch(/^\d+(\.\d+)? pt$/);
    expect(shown['Font']).toContain('(from body)');
    expect(shown['Marks']).toContain('emphasis');
    expect(text()).toContain('Based on: body');
  });

  it('shows the table style as well as the cell style when the cursor is in a table', () => {
    at(2, 0);
    expect(root.querySelector('summary')?.textContent).toBe('Style: table-cell \u00b7 table');
    expect(text()).toContain('Table style table');
    expect(text()).toContain('Paragraph style table-cell');
    expect(rows()['Cell style']).toBe('table-cell');
  });

  it('opens the style editor with the button', () => {
    at(1, 2);
    root.querySelector('button')?.click();
    expect(edit).toHaveBeenCalledOnce();
  });
});

describe('where the style is used', () => {
  it('says that it is not known before the usage has come', () => {
    at(1, 2);
    expect(text()).toContain('Where it is used is not known yet.');
  });

  it('counts the blocks and the documents, and marks this document', () => {
    at(1, 2);
    info.setUsage(usage);
    expect(text()).toContain('Used by 5 blocks in 2 documents.');
    const lines = [...root.querySelectorAll('li')].map((li) => li.textContent);
    expect(lines).toEqual([
      'documents/one.phrase.md (this document): 3 by default, 5 through styles based on it',
      'documents/two.phrase.md: 1 named, 1 by default',
    ]);
  });

  it('says so when no document uses the style itself', () => {
    at(1, 2);
    info.setUsage({ ...usage, paragraph: {} });
    expect(text()).toContain('No document uses this style itself.');
    expect(root.querySelector('li')).toBeNull();
  });

  it('draws again for another style, and when the usage or the stylesheet changes', () => {
    at(1, 2);
    info.setUsage(usage);
    at(0, 1);
    expect(text()).toContain('Used by 2 blocks in 1 document.');
    info.setUsage({ ...usage, paragraph: {} });
    expect(text()).toContain('No document uses this style itself.');
  });

  it('does not draw again while nothing has changed, so that the button keeps the focus', () => {
    at(1, 2);
    const button = root.querySelector('button');
    info.refresh();
    expect(root.querySelector('button')).toBe(button);
  });
});
