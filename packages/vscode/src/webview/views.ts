import type { Reason } from '../shared/protocol.js';

export interface RefusedActions {
  readonly format: () => void;
  readonly openAsText: () => void;
}

/** Shows why a file is not edited visually, and what can be done about it. Builds no HTML from text. */
export function showRefused(
  root: HTMLElement,
  title: string,
  reasons: readonly Reason[],
  canFormat: boolean,
  actions: RefusedActions,
): void {
  const heading = document.createElement('h1');
  heading.textContent = title;

  const list = document.createElement('ul');
  for (const reason of reasons) {
    const item = document.createElement('li');
    item.textContent =
      reason.line === undefined ? reason.message : `Line ${String(reason.line)}: ${reason.message}`;
    list.append(item);
  }

  const buttons = document.createElement('p');
  const add = (label: string, run: () => void): void => {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', run);
    buttons.append(button);
  };
  if (canFormat) add('Format and open', actions.format);
  add('Open as text', actions.openAsText);

  root.replaceChildren(heading, list, buttons);
}
