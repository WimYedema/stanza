// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStylesheet } from '@stanza/format';
import type { StyleKind, StylesWebviewMessage } from '../shared/styles-protocol.js';
import { createAddPanel, type AddPanel } from './styles-add.js';

const SOURCE = `stanza-format: 1
paragraph-styles:
  body: {}
  note: { based-on: body }
character-styles:
  status: { bold: true }
table-styles:
  table: {}
`;
const stylesheet = parseStylesheet(SOURCE).stylesheet;

let root: HTMLElement;
let panel: AddPanel;
const send = vi.fn<(message: StylesWebviewMessage) => void>();
const added = vi.fn<(kind: StyleKind, name: string) => void>();

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  send.mockClear();
  added.mockClear();
  panel = createAddPanel({ root, send, added });
  panel.show('paragraphs', stylesheet);
});
afterEach(() => {
  document.body.replaceChildren();
});

const name = (): HTMLInputElement => {
  const found = root.querySelector('input');
  if (found === null) throw new Error('No name.');
  return found;
};
const base = (): HTMLSelectElement => {
  const found = root.querySelector('select');
  if (found === null) throw new Error('No base.');
  return found;
};
const add = (): void => {
  root.querySelector('button')?.click();
};
const status = (): string => root.querySelector('.status')?.textContent ?? '';

describe('the form for a new style', () => {
  it('shows for the families that people add to, and for no other', () => {
    expect(root.hidden).toBe(false);
    for (const family of ['headings', 'lists', 'pages', 'theme'] as const) {
      panel.show(family, stylesheet);
      expect(root.hidden).toBe(true);
    }
    panel.show('characters', stylesheet);
    expect(root.hidden).toBe(false);
  });

  it('offers the styles of the family as a base, with body chosen for a paragraph style', () => {
    expect([...base().options].map((option) => option.value)).toEqual(['', 'body', 'note']);
    expect(base().value).toBe('body');
    panel.show('tables', stylesheet);
    expect([...base().options].map((option) => option.value)).toEqual(['', 'table']);
    expect(base().value).toBe('table');
    panel.show('characters', stylesheet);
    expect(base().value).toBe('');
  });

  it('keeps the base that was chosen when the stylesheet changes', () => {
    base().value = 'note';
    panel.show('paragraphs', stylesheet);
    expect(base().value).toBe('note');
  });

  it('asks for a style, and says which one to select', () => {
    name().value = ' tip ';
    base().value = 'note';
    add();
    expect(send).toHaveBeenLastCalledWith({
      type: 'add-style',
      kind: 'paragraph-style',
      name: 'tip',
      basedOn: 'note',
    });
    expect(added).toHaveBeenLastCalledWith('paragraph-style', 'tip');
  });

  it('asks for a style that is based on none', () => {
    panel.show('characters', stylesheet);
    name().value = 'marker';
    add();
    expect(send).toHaveBeenLastCalledWith({
      type: 'add-style',
      kind: 'character-style',
      name: 'marker',
    });
  });

  it('refuses a name that is not kebab-case, and one that is taken, without asking the host', () => {
    name().value = 'Not Kebab';
    add();
    expect(status()).toContain('kebab-case');
    name().value = 'note';
    add();
    expect(status()).toBe('There is a paragraph style note already.');
    expect(send).not.toHaveBeenCalled();
  });

  it('clears the form when the style is in the stylesheet', () => {
    name().value = 'tip';
    add();
    panel.show(
      'paragraphs',
      parseStylesheet(SOURCE.replace('character-styles', '  tip: {}\ncharacter-styles')).stylesheet,
    );
    expect(name().value).toBe('');
  });

  it('shows why a style was refused, only when it was asked for', () => {
    panel.refused('Some other change was refused.');
    expect(status()).toBe('');
    name().value = 'tip';
    add();
    panel.refused('The change would make the stylesheet invalid.');
    expect(status()).toBe('The change would make the stylesheet invalid.');
  });
});
