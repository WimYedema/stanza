// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStylesheet } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { entriesOf, type Entry } from './styles-families.js';
import { createThemePanel, type ThemePanel } from './styles-theme.js';

const stylesheet = parseStylesheet(`stanza-format: 1
tokens:
  colors:
    brand: '#2E75B6'
  fonts:
    body: ['Calibri', 'Arial']
paragraph-styles:
  body:
    font: body
`).stylesheet;

const entry = (name: string, kind: 'color' | 'font'): Entry => {
  const found = entriesOf(stylesheet).find(
    (candidate) => candidate.name === name && candidate.kind === kind,
  );
  if (found === undefined) throw new Error(`No token ${name}.`);
  return found;
};

let root: HTMLElement;
let panel: ThemePanel;
const send = vi.fn<(message: StylesWebviewMessage) => void>();

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  send.mockClear();
  panel = createThemePanel({ root, send });
});
afterEach(() => {
  document.body.replaceChildren();
});

const input = (index: number): HTMLInputElement => {
  const found = root.querySelectorAll('input')[index];
  if (found === undefined) throw new Error(`No input ${String(index)}.`);
  return found;
};
const type = (field: HTMLInputElement, value: string): void => {
  field.value = value;
  field.dispatchEvent(new Event('change'));
};
const status = (): string => root.querySelector('.status')?.textContent ?? '';
const addButton = (): HTMLButtonElement => {
  const found = root.querySelector('button');
  if (found === null) throw new Error('No button.');
  return found;
};
/** The inputs: the swatch, the color, the families, then the name and value of the form. */
const SWATCH = 0;
const COLOR = 1;
const FAMILIES = 2;
const NAME = 3;
const VALUE = 4;

describe('the theme panel', () => {
  it('is hidden outside the Theme tab', () => {
    expect(panel.show(entry('brand', 'color'), 'paragraphs', stylesheet)).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('shows the value of a color token and sets a new one in capitals', () => {
    expect(panel.show(entry('brand', 'color'), 'theme', stylesheet)).toBe(true);
    expect(input(COLOR).value).toBe('#2E75B6');
    expect(input(SWATCH).hidden).toBe(false);
    type(input(COLOR), '#1a2b3c');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['tokens', 'colors', 'brand'],
      value: '#1A2B3C',
    });
  });

  it('sets the color from the swatch', () => {
    panel.show(entry('brand', 'color'), 'theme', stylesheet);
    type(input(SWATCH), '#00ff00');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['tokens', 'colors', 'brand'],
      value: '#00FF00',
    });
  });

  it('refuses a color that is not #RRGGBB and shows the value again', () => {
    panel.show(entry('brand', 'color'), 'theme', stylesheet);
    type(input(COLOR), 'red');
    expect(send).not.toHaveBeenCalled();
    expect(status()).toBe('A color is written as #RRGGBB.');
    expect(input(COLOR).value).toBe('#2E75B6');
  });

  it('shows the families of a font token and sets them as a list', () => {
    panel.show(entry('body', 'font'), 'theme', stylesheet);
    expect(input(FAMILIES).value).toBe('Calibri, Arial');
    type(input(FAMILIES), 'Georgia,  Times New Roman');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['tokens', 'fonts', 'body'],
      value: ['Georgia', 'Times New Roman'],
    });
  });

  it('refuses a font without a family', () => {
    panel.show(entry('body', 'font'), 'theme', stylesheet);
    type(input(FAMILIES), ' , ');
    expect(send).not.toHaveBeenCalled();
    expect(status()).toBe('A font needs at least one family.');
  });

  it('shows the form for a new token and no token editor when nothing is selected', () => {
    expect(panel.show(undefined, 'theme', stylesheet)).toBe(true);
    expect(root.querySelector('section')?.hidden).toBe(true);
    expect(root.textContent).toContain('New token');
  });

  it('adds a color token', () => {
    panel.show(undefined, 'theme', stylesheet);
    input(NAME).value = 'accent';
    input(VALUE).value = '#abcdef';
    addButton().click();
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['tokens', 'colors', 'accent'],
      value: '#ABCDEF',
    });
  });

  it('adds a font token', () => {
    panel.show(undefined, 'theme', stylesheet);
    const kind = root.querySelector('select');
    if (kind === null) throw new Error('No kind.');
    kind.value = 'font';
    kind.dispatchEvent(new Event('change'));
    input(NAME).value = 'mono';
    input(VALUE).value = 'Consolas, Courier New';
    addButton().click();
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['tokens', 'fonts', 'mono'],
      value: ['Consolas', 'Courier New'],
    });
  });

  it('refuses a name that is not kebab-case, one that is taken, and a missing value', () => {
    panel.show(undefined, 'theme', stylesheet);
    input(NAME).value = 'Not Kebab';
    input(VALUE).value = '#000000';
    addButton().click();
    expect(status()).toContain('kebab-case');
    input(NAME).value = 'brand';
    addButton().click();
    expect(status()).toBe('There is a color token brand already.');
    input(NAME).value = 'accent';
    input(VALUE).value = '';
    addButton().click();
    expect(status()).toBe('A color is written as #RRGGBB.');
    expect(send).not.toHaveBeenCalled();
  });

  it('clears the form once the token is in the stylesheet', () => {
    panel.show(undefined, 'theme', stylesheet);
    input(NAME).value = 'accent';
    input(VALUE).value = '#abcdef';
    panel.show(
      undefined,
      'theme',
      parseStylesheet(
        "stanza-format: 1\ntokens:\n  colors:\n    accent: '#ABCDEF'\nparagraph-styles:\n  body: {}\n",
      ).stylesheet,
    );
    expect(input(NAME).value).toBe('');
    expect(input(VALUE).value).toBe('');
  });

  it('shows the reason a change was refused', () => {
    panel.show(undefined, 'theme', stylesheet);
    panel.refused('The change would make the stylesheet invalid.');
    expect(status()).toBe('The change would make the stylesheet invalid.');
  });
});
