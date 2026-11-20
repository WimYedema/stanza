// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Diagnostic, NodeId } from '@stanza/core';
import { parseDocument, parseStylesheet } from '@stanza/format';
import { createStanzaEditor, type StanzaEditor } from './editor.js';

const stylesheet = parseStylesheet(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../fixtures/example-project/styles/default.yaml',
    ),
    'utf8',
  ).replace(/\r\n/g, '\n'),
).stylesheet;

const BODY = `<!-- stanza: #k7m2q9x4zb -->
# One

Text.

## Sub A

## Sub B

# Two

#### Not numbered

- first
- second
`;

let element: HTMLElement;
let editor: StanzaEditor | undefined;

beforeEach(() => {
  element = document.createElement('div');
  document.body.append(element);
});
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  element.remove();
});

function open(body = BODY): StanzaEditor {
  const parsed = parseDocument(`---\nstanza-format: 1\ntitle: "T"\n---\n\n${body}`);
  editor = createStanzaEditor({ element, stylesheet, document: parsed.document });
  return editor;
}

const numbers = (): (string | null)[] =>
  [...element.querySelectorAll('.ProseMirror > h1, .ProseMirror > h2, .ProseMirror > h4')].map(
    (heading) => heading.querySelector('.stanza-heading-number')?.textContent ?? null,
  );
const marked = (): HTMLElement[] => [
  ...element.querySelectorAll<HTMLElement>('.stanza-diagnostic'),
];

const diagnostic = (extra: Partial<Diagnostic> = {}): Diagnostic => ({
  severity: 'warning',
  code: 'some-code',
  message: 'Something to look at.',
  ...extra,
});

describe('the numbers of the headings', () => {
  it('shows the number of each numbered heading, and none for a style that is not numbered', () => {
    open();
    expect(numbers()).toEqual(['1', '1.1', '1.2', '2', null]);
  });

  it('is not part of the text or the document', () => {
    const api = open();
    const heading = element.querySelector('h1');
    expect(heading?.querySelector('.stanza-heading-number')?.getAttribute('contenteditable')).toBe(
      'false',
    );
    expect(api.getDocument().document?.blocks[0]).toMatchObject({
      type: 'heading',
      content: [{ text: 'One' }],
    });
    expect(api.getPosition()).toEqual({ block: 0, offset: 0 });
  });

  it('follows the content: a new heading shifts the numbers that come after it', () => {
    const api = open();
    api.setDocument(
      parseDocument(
        `---\nstanza-format: 1\ntitle: "T"\n---\n\n# Zero\n\n${BODY.replace('<!-- stanza: #k7m2q9x4zb -->\n', '')}`,
      ).document,
    );
    expect(numbers()).toEqual(['1', '2', '2.1', '2.2', '3', null]);
  });

  it('follows the stylesheet', () => {
    const api = open();
    const plain = parseStylesheet(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '../../../fixtures/example-project/styles/default.yaml',
        ),
        'utf8',
      )
        .replace(/\r\n/g, '\n')
        .replace('numbered: true', 'numbered: false'),
    ).stylesheet;
    expect(api.setStylesheet(plain)).toEqual([]);
    expect(numbers().filter((value) => value !== null)).toEqual([]);
  });
});

describe('the marks of the diagnostics', () => {
  it('marks the block that a diagnostic names by its ID, with the message as the tooltip', () => {
    const api = open();
    api.setDiagnostics([diagnostic({ nodeId: 'k7m2q9x4zb' as NodeId })]);
    const [block] = marked();
    expect(marked()).toHaveLength(1);
    expect(block?.tagName).toBe('H1');
    expect(block?.title).toBe('Something to look at.');
    expect(block?.classList.contains('stanza-diagnostic-warning')).toBe(true);
  });

  it('marks the top-level block of a path when there is no ID', () => {
    const api = open();
    api.setDiagnostics([diagnostic({ path: 'blocks[1].content' })]);
    expect(marked().map((node) => node.textContent)).toEqual(['Text.']);
  });

  it('puts the messages of one block together, and shows the worst severity', () => {
    const api = open();
    api.setDiagnostics([
      diagnostic({ path: 'blocks[1]', message: 'First.' }),
      diagnostic({ path: 'blocks[1]', message: 'Second.', severity: 'error' }),
    ]);
    const [block] = marked();
    expect(marked()).toHaveLength(1);
    expect(block?.title).toBe('First.\nSecond.');
    expect(block?.classList.contains('stanza-diagnostic-error')).toBe(true);
    expect(block?.classList.contains('stanza-diagnostic-warning')).toBe(false);
  });

  it('marks the whole list for a diagnostic about one of its items, and keeps its other classes', () => {
    const api = open();
    api.setDiagnostics([diagnostic({ path: 'blocks[6].items[1].blocks[0]' })]);
    expect(marked().map((node) => node.tagName)).toEqual(['UL']);
    expect(marked()[0]?.classList.contains('stanza-diagnostic-warning')).toBe(true);
    expect(marked()[0]?.className).toMatch(/\bstanza-list\b/);
  });

  it('leaves out a diagnostic about nothing in the document, and a block that is gone', () => {
    const api = open();
    api.setDiagnostics([
      diagnostic(),
      diagnostic({ path: 'blocks[99]' }),
      diagnostic({ nodeId: 'zzzzzzzzzz' as NodeId }),
      diagnostic({ path: 'paragraph-styles.body.size' }),
    ]);
    expect(marked()).toEqual([]);
  });

  it('shows new diagnostics in place of the old ones, and none for an empty list', () => {
    const api = open();
    api.setDiagnostics([diagnostic({ path: 'blocks[1]' })]);
    api.setDiagnostics([diagnostic({ path: 'blocks[0]' })]);
    expect(marked().map((node) => node.tagName)).toEqual(['H1']);
    api.setDiagnostics([]);
    expect(marked()).toEqual([]);
  });

  it('is never part of the document', () => {
    const api = open();
    api.setDiagnostics([diagnostic({ path: 'blocks[1]' })]);
    expect(api.getDocument().document?.blocks[1]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Text.', marks: [] }],
    });
  });
});
