import type { ReviewRoundView, WebviewMessage } from '../shared/protocol.js';

/**
 * The review buttons of the toolbar (ADR 0088): Push, with a menu for another folder, a new file
 * and the folder itself; Pull, from the file in the review folder; and where the round stands, so
 * that it is clear which of the two is due.
 */

export interface ReviewRoundBar {
  /** The group, to put in the toolbar. */
  readonly element: HTMLElement;
  /** Shows where the round stands, as the host found it. */
  show(status: ReviewRoundView, folder: string | undefined): void;
  /** A push or pull is over: the buttons can be used again. */
  done(): void;
}

const plural = (n: number, noun: string): string => `${String(n)} ${noun}${n === 1 ? '' : 's'}`;

/** The text of the status, its tooltip, and which button is due. */
export function describeRound(
  status: ReviewRoundView,
  folder: string | undefined,
): { readonly text: string; readonly title: string; readonly due?: 'push' | 'pull' } {
  const where = folder === undefined ? '' : ` in ${folder}`;
  switch (status.kind) {
    case 'not-pushed':
      return {
        text: 'Not pushed',
        title:
          folder === undefined
            ? 'Push to choose a review folder for this document.'
            : `There is no file of this document${where} yet.`,
      };
    case 'current':
      return { text: 'Pushed, no changes', title: `The file${where} holds the document as it is.` };
    case 'changed':
      return {
        text: 'Changed since push',
        title: `The document changed since the file${where} was pushed. Push to update it.`,
        due: 'push',
      };
    case 'unpulled':
      return {
        text:
          status.comments === 0
            ? '● Saved by a reviewer'
            : `● ${plural(status.comments, 'new comment')}`,
        title: `A reviewer saved the file${where} on ${status.savedAt} UTC, and that version was not pulled. Pull to bring the comments in.`,
        due: 'pull',
      };
    case 'not-this-document':
      return { text: 'Review file is not this document', title: status.message };
  }
}

function button(text: string, title: string): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.textContent = text;
  made.title = title;
  return made;
}

export function createReviewRoundBar(send: (message: WebviewMessage) => void): ReviewRoundBar {
  const group = document.createElement('div');
  group.className = 'group review-round';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Review');

  const push = button('Push', 'Build this document and write it to its review folder');
  const more = button('▾', 'More ways to push');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  const pull = button('Pull', 'Pull the comments from the file in the review folder');
  const status = document.createElement('span');
  status.className = 'review-round-status';
  status.setAttribute('role', 'status');

  const menu = document.createElement('div');
  menu.className = 'review-round-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  const item = (text: string, action: () => void): HTMLButtonElement => {
    const entry = button(text, '');
    entry.setAttribute('role', 'menuitem');
    entry.addEventListener('click', () => {
      closeMenu();
      action();
    });
    return entry;
  };
  let busy = false;
  const setBusy = (label: string | undefined): void => {
    busy = label !== undefined;
    for (const control of [push, more, pull]) control.disabled = busy;
    if (label !== undefined) status.textContent = label;
  };
  const pushAs = (mode: 'remembered' | 'choose' | 'new'): void => {
    setBusy('Pushing…');
    send({ type: 'review-push', mode });
  };
  menu.append(
    item('Push to Another Folder…', () => {
      pushAs('choose');
    }),
    item('Push as a New File', () => {
      pushAs('new');
    }),
    item('Open Review Folder', () => {
      send({ type: 'open-review-folder' });
    }),
  );

  function closeMenu(): void {
    menu.hidden = true;
    more.setAttribute('aria-expanded', 'false');
  }
  push.addEventListener('click', () => {
    pushAs('remembered');
  });
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button')?.focus();
  });
  pull.addEventListener('click', () => {
    setBusy('Pulling…');
    send({ type: 'review-pull' });
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && event.target instanceof Node && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      more.focus();
    }
  });

  const pushGroup = document.createElement('span');
  pushGroup.className = 'review-round-push';
  pushGroup.append(push, more, menu);
  group.append(pushGroup, pull, status);
  // Until the host says where the round stands, nothing is known.
  group.hidden = true;

  let last: { status: ReviewRoundView; folder: string | undefined } | undefined;
  const render = (): void => {
    if (last === undefined) return;
    const described = describeRound(last.status, last.folder);
    status.textContent = described.text;
    status.title = described.title;
    status.classList.toggle('due', described.due !== undefined);
    push.classList.toggle('due', described.due === 'push');
    pull.classList.toggle('due', described.due === 'pull');
    pull.title =
      last.folder === undefined
        ? 'Pull the comments from a reviewed file'
        : `Pull the comments from the file in ${last.folder}`;
  };

  return {
    element: group,
    show(next, folder) {
      last = { status: next, folder };
      group.hidden = false;
      if (!busy) render();
    },
    done() {
      setBusy(undefined);
      render();
    },
  };
}
