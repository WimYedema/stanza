// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStylesheet } from '@phrase/format';
import type { Entry, Family } from './styles-families.js';
import { createStylesView, type StylesView } from './styles-view.js';

const SOURCE = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../fixtures/example-project/styles/default.yaml',
  ),
  'utf8',
).replaceAll('\r\n', '\n');
const stylesheet = parseStylesheet(SOURCE).stylesheet;

let tabs: HTMLElement;
let list: HTMLElement;
let detail: HTMLElement;
let view: StylesView;
const selected = vi.fn<(entry: Entry | undefined, family: Family) => void>();

beforeEach(() => {
  tabs = document.createElement('div');
  list = document.createElement('ul');
  detail = document.createElement('dl');
  document.body.append(tabs, list, detail);
  selected.mockClear();
  view = createStylesView({ tabs, list, detail }, selected);
  view.show(stylesheet);
});
afterEach(() => {
  document.body.replaceChildren();
});

const tab = (title: string): HTMLButtonElement => {
  const found = [...tabs.querySelectorAll('button')].find((b) => b.textContent.startsWith(title));
  if (found === undefined) throw new Error(`No tab ${title}.`);
  return found;
};
const items = (): (string | null)[] => [...list.querySelectorAll('li')].map((li) => li.textContent);
const choose = (text: string): void => {
  const found = [...list.querySelectorAll('button')].find(
    (b) => b.firstChild?.textContent === text,
  );
  if (found === undefined) throw new Error(`No item ${text}.`);
  found.click();
};

describe('the tabs', () => {
  it('are the families, with how many each has, and the first is shown', () => {
    expect([...tabs.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Paragraphs (9)',
      'Headings (6)',
      'Lists (2)',
      'Tables (2)',
      'Character styles (2)',
      'Pages (2)',
      'Theme (6)',
    ]);
    expect(tab('Paragraphs').getAttribute('aria-selected')).toBe('true');
    expect(items()[0]).toBe('body');
  });

  it('show the styles of a family when chosen', () => {
    tab('Headings').click();
    expect(tab('Headings').getAttribute('aria-selected')).toBe('true');
    expect(tab('Paragraphs').getAttribute('aria-selected')).toBe('false');
    expect(items()).toHaveLength(6);
    expect(selected).toHaveBeenLastCalledWith(undefined, 'headings');
  });
});

describe('the list', () => {
  it('selects a style, shows what the stylesheet says about it, and tells the caller', () => {
    tab('Headings').click();
    choose('heading-2');
    const current = list.querySelector('[aria-current="true"]');
    expect(current?.firstChild?.textContent).toBe('heading-2');
    expect([...detail.children].map((child) => child.textContent)).toEqual([
      'Name',
      'heading-2',
      'Based on',
      'heading-1',
    ]);
    expect(selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'heading-2', kind: 'paragraph-style' }),
      'headings',
    );
  });

  it('shows the label of a style, and its name under it', () => {
    const labelled = parseStylesheet(
      SOURCE.replace(
        '  cover-meta:\n    based-on: body',
        "  cover-meta:\n    label: 'Cover details'\n    based-on: body",
      ),
    ).stylesheet;
    view.show(labelled);
    const found = [...list.querySelectorAll('button')].find(
      (b) => b.firstChild?.textContent === 'Cover details',
    );
    expect(found?.querySelector('.name')?.textContent).toBe('cover-meta');
  });

  it('says so when a family has nothing, as for page templates of a stylesheet that has none', () => {
    view.show(parseStylesheet(SOURCE.slice(0, SOURCE.indexOf('page-templates:'))).stylesheet);
    tab('Pages').click();
    expect(items()).toEqual(['No page templates. The built-in A4 page is used.']);
  });

  it('keeps the selection when the stylesheet changes, and drops it when the style is gone', () => {
    choose('body');
    view.show(parseStylesheet(SOURCE.replace('size: 11', 'size: 12')).stylesheet);
    expect(list.querySelector('[aria-current="true"]')?.firstChild?.textContent).toBe('body');
    expect(selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'body' }),
      'paragraphs',
    );
    tab('Pages').click();
    choose('page');
    view.show(parseStylesheet(SOURCE.slice(0, SOURCE.indexOf('page-templates:'))).stylesheet);
    expect(selected).toHaveBeenLastCalledWith(undefined, 'pages');
  });

  it('writes text and never markup', () => {
    const tricky = parseStylesheet(
      SOURCE.replace(
        '  cover-meta:\n    based-on: body',
        "  cover-meta:\n    label: '<img src=x>'\n    based-on: body",
      ),
    ).stylesheet;
    view.show(tricky);
    expect(list.querySelector('img')).toBeNull();
    expect(list.textContent).toContain('<img src=x>');
  });
});

describe('selecting a style that was just added', () => {
  it('selects it in its tab once a stylesheet that has it is shown', () => {
    view.selectWhenShown('character-style', 'badge');
    expect(list.querySelector('[aria-current="true"]')?.firstChild?.textContent).not.toBe('badge');
    view.show(
      parseStylesheet(SOURCE.replace('character-styles:\n', 'character-styles:\n  badge: {}\n'))
        .stylesheet,
    );
    expect(tab('Character styles').getAttribute('aria-selected')).toBe('true');
    expect(list.querySelector('[aria-current="true"]')?.firstChild?.textContent).toBe('badge');
    expect(selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'badge', kind: 'character-style' }),
      'characters',
    );
  });

  it('waits when the stylesheet does not have it yet, and does not select anything else', () => {
    view.selectWhenShown('character-style', 'badge');
    view.show(stylesheet);
    expect(tab('Paragraphs').getAttribute('aria-selected')).toBe('true');
  });
});
