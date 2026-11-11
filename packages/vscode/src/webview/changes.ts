/** The line under the toolbar that tells how much changed from outside, and steps through it (ADR 0062). */

export interface ChangesBarActions {
  /** Go to the next marked block. */
  readonly next: () => void;
  /** Take the marks off. */
  readonly dismiss: () => void;
}

export interface ChangesBar {
  /** Shows the counts, or hides the bar when there is nothing changed or removed. */
  show(changed: number, removed: number): void;
}

const count = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

export function createChangesBar(root: HTMLElement, actions: ChangesBarActions): ChangesBar {
  const text = root.ownerDocument.createElement('span');
  const next = root.ownerDocument.createElement('button');
  next.type = 'button';
  next.textContent = 'Next change';
  next.addEventListener('click', actions.next);
  const dismiss = root.ownerDocument.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', actions.dismiss);
  root.append(text, next, dismiss);
  let shown = '';

  return {
    show(changed, removed) {
      root.hidden = changed === 0 && removed === 0;
      const parts = [
        ...(changed > 0 ? [`${count(changed, 'block')} changed`] : []),
        ...(removed > 0 ? [`${count(removed, 'block')} removed`] : []),
      ];
      const message = `Changed from outside: ${parts.join(', ')}`;
      if (message !== shown) text.textContent = message;
      shown = message;
      next.disabled = changed === 0;
    },
  };
}
