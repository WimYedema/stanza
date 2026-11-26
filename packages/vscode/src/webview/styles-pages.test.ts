// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStylesheet } from '@stanza/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { entriesOf, type Entry } from './styles-families.js';
import { createPagePanel, type PagePanel } from './styles-pages.js';

const stylesheet = parseStylesheet(`stanza-format: 1
paragraph-styles:
  body: {}
  header-footer:
    based-on: body
page-templates:
  page:
    size: A4
    margins: { top: 54, right: 90 }
    header:
      style: header-footer
      left: '[](stanza:title)'
      right: 'Page [1](stanza:page) of [1](stanza:pages)'
  plain:
    size: Letter
`).stylesheet;

const entry = (name: string): Entry => {
  const found = entriesOf(stylesheet).find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`No entry ${name}.`);
  return found;
};

let root: HTMLElement;
let panel: PagePanel;
const send = vi.fn<(message: StylesWebviewMessage) => void>();

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  send.mockClear();
  panel = createPagePanel({ root, send });
  panel.show(entry('page'), stylesheet);
});
afterEach(() => {
  document.body.replaceChildren();
});

/** The row of a group with a title, such as the Left slot of the Header. */
function rowOf(group: string, title: string): HTMLElement {
  const summary = [...root.querySelectorAll('summary')].find((s) => s.textContent === group);
  const found = [...(summary?.parentElement?.querySelectorAll('.row') ?? [])].find(
    (r) => r.querySelector('.title')?.textContent === title,
  );
  if (found === undefined) throw new Error(`No row ${title} in ${group}.`);
  return found as HTMLElement;
}
const inputOf = (group: string, title: string): HTMLInputElement => {
  const found = rowOf(group, title).querySelector('input');
  if (found === null) throw new Error('No input.');
  return found;
};
const selectOf = (group: string, title: string): HTMLSelectElement => {
  const found = rowOf(group, title).querySelector('select');
  if (found === null) throw new Error('No select.');
  return found;
};
const change = (field: HTMLInputElement | HTMLSelectElement, value: string): void => {
  field.value = value;
  field.dispatchEvent(new Event('change'));
};
const status = (): string => root.querySelector('.status')?.textContent ?? '';

describe('the page panel', () => {
  it('shows only for a page template', () => {
    expect(panel.show(entry('body'), stylesheet)).toBe(false);
    expect(root.hidden).toBe(true);
    expect(panel.show(entry('plain'), stylesheet)).toBe(true);
    expect(root.hidden).toBe(false);
  });

  it('shows the size, the margins and the slots of the template', () => {
    expect(selectOf('Page', 'Size').value).toBe('A4');
    expect(inputOf('Margins', 'Top').value).toBe('54');
    expect(inputOf('Margins', 'Left').value).toBe('72');
    expect(selectOf('Header', 'Style').value).toBe('header-footer');
    expect(inputOf('Header', 'Left').value).toBe('[](stanza:title)');
    expect(inputOf('Header', 'Center').value).toBe('');
    expect(inputOf('Header', 'Right').value).toBe('Page [1](stanza:page) of [1](stanza:pages)');
    panel.show(entry('plain'), stylesheet);
    expect(selectOf('Page', 'Size').value).toBe('Letter');
    expect(inputOf('Header', 'Left').value).toBe('');
    expect(selectOf('Header', 'Style').value).toBe('');
  });

  it('sets the size', () => {
    change(selectOf('Page', 'Size'), 'Letter');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'size'],
      value: 'Letter',
    });
  });

  it('sets one margin, and takes it off when it is emptied', () => {
    change(inputOf('Margins', 'Bottom'), '36');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'margins', 'bottom'],
      value: 36,
    });
    change(inputOf('Margins', 'Top'), '');
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: ['page-templates', 'page', 'margins', 'top'],
    });
  });

  it('sets a slot as text, and takes it off when it is emptied', () => {
    change(inputOf('Footer', 'Center'), 'Confidential');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'footer', 'center'],
      value: 'Confidential',
    });
    change(inputOf('Header', 'Left'), '');
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: ['page-templates', 'page', 'header', 'left'],
    });
  });

  it('sets the style of a line, or takes it off for the body', () => {
    change(selectOf('Footer', 'Style'), 'header-footer');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'footer', 'style'],
      value: 'header-footer',
    });
    change(selectOf('Header', 'Style'), '');
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: ['page-templates', 'page', 'header', 'style'],
    });
  });

  it('inserts a value at the cursor of a slot', () => {
    const slot = inputOf('Footer', 'Right');
    slot.value = 'Page  of';
    slot.setSelectionRange(5, 5);
    change(selectOf('Footer', 'Right'), 'page');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'footer', 'right'],
      value: 'Page [1](stanza:page) of',
    });
    change(selectOf('Footer', 'Left'), 'title');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'footer', 'left'],
      value: '[](stanza:title)',
    });
  });

  it('shows the reason a change was refused, and the stylesheet as it is', () => {
    inputOf('Margins', 'Top').value = '-5';
    panel.refused('The change would make the stylesheet invalid.');
    expect(status()).toBe('The change would make the stylesheet invalid.');
    expect(inputOf('Margins', 'Top').value).toBe('54');
  });

  it('sets the distance of the header from the edge, and clears it to the default (ADR 0095)', () => {
    const distance = inputOf('Header', 'Distance');
    expect(distance.value).toBe('');
    expect(distance.placeholder).toBe('35.4');
    change(distance, '20');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['page-templates', 'page', 'header', 'distance'],
      value: 20,
    });
    change(distance, '');
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: ['page-templates', 'page', 'header', 'distance'],
    });
  });
});
