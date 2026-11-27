/** Small helpers for building the panels of the style editor. Only text is written, never markup. */

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export function option(value: string, text: string): HTMLOptionElement {
  const created = el('option', undefined, text);
  created.value = value;
  return created;
}

/** An open group with a title, for the panels that are not built from the list of properties. */
export function simpleSection(title: string, ...parts: HTMLElement[]): HTMLElement {
  const node = el('section');
  const group = el('details');
  group.open = true;
  group.append(el('summary', undefined, title), ...parts);
  node.append(group);
  return node;
}

/** A title and the controls that go with it. */
export function simpleRow(title: string, ...controls: HTMLElement[]): HTMLElement {
  const node = el('div', 'row');
  const control = el('span', 'control');
  control.append(...controls);
  node.append(el('label', 'title', title), control);
  return node;
}

/**
 * Draws a part of a panel again, and puts the focus back on the field at the same place in it, so
 * that every field holds the model as it is now and the person can go on where they were.
 */
export function redrawKeepingFocus(root: HTMLElement, draw: () => void): void {
  const fields = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>('input, select, textarea, button'),
  ];
  const active = root.ownerDocument.activeElement;
  const index = active instanceof HTMLElement ? fields().indexOf(active) : -1;
  draw();
  if (index >= 0) fields()[index]?.focus();
}
