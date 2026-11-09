import type { Stylesheet } from '@phrase/core';
import {
  FAMILIES,
  describeEntry,
  displayName,
  entriesOf,
  type Entry,
  type Family,
} from './styles-families.js';

export interface StylesViewElements {
  readonly tabs: HTMLElement;
  readonly list: HTMLElement;
  readonly detail: HTMLElement;
}

export interface StylesView {
  /** Draws the tabs, the list and the detail for a stylesheet, keeping the selection if it is still there. */
  show(stylesheet: Stylesheet): void;
}

const EMPTY: Partial<Record<Family, string>> = {
  pages: 'No page templates. The built-in A4 page is used.',
};

const keyOf = (entry: Entry): string => `${entry.kind}:${entry.name}`;

/**
 * The tabs of the families, the list of the styles of one of them, and what the stylesheet says
 * about the selected one (ADR 0036). Only text is written into the page, never markup.
 */
export function createStylesView(
  elements: StylesViewElements,
  onSelect: (entry: Entry | undefined, family: Family) => void,
): StylesView {
  let stylesheet: Stylesheet | undefined;
  let entries: readonly Entry[] = [];
  let family: Family = 'paragraphs';
  let selectedKey: string | undefined;

  const selected = (): Entry | undefined =>
    entries.find((entry) => entry.family === family && keyOf(entry) === selectedKey);

  const button = (text: string): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    return element;
  };

  function draw(): void {
    elements.tabs.replaceChildren(
      ...FAMILIES.map(({ id, title }) => {
        const count = entries.filter((entry) => entry.family === id).length;
        const tab = button(`${title} (${String(count)})`);
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(id === family));
        tab.addEventListener('click', () => {
          family = id;
          selectedKey = undefined;
          draw();
          onSelect(undefined, family);
        });
        return tab;
      }),
    );

    const here = entries.filter((entry) => entry.family === family);
    if (here.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = EMPTY[family] ?? 'Nothing here.';
      elements.list.replaceChildren(empty);
    } else {
      elements.list.replaceChildren(
        ...here.map((entry) => {
          const item = document.createElement('li');
          const choose = button(displayName(entry));
          if (keyOf(entry) === selectedKey) choose.setAttribute('aria-current', 'true');
          if (displayName(entry) !== entry.name) {
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = entry.name;
            choose.append(name);
          }
          choose.addEventListener('click', () => {
            selectedKey = keyOf(entry);
            draw();
            onSelect(entry, family);
          });
          item.append(choose);
          return item;
        }),
      );
    }

    const current = selected();
    elements.detail.replaceChildren(
      ...(current === undefined || stylesheet === undefined
        ? []
        : describeEntry(current, stylesheet).flatMap(([term, meaning]) => {
            const dt = document.createElement('dt');
            dt.textContent = term;
            const dd = document.createElement('dd');
            dd.textContent = meaning;
            return [dt, dd];
          })),
    );
  }

  return {
    show(next) {
      stylesheet = next;
      entries = entriesOf(next);
      if (selected() === undefined) selectedKey = undefined;
      draw();
      onSelect(selected(), family);
    },
  };
}
