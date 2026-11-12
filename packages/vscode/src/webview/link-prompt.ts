import type { CommandResult, EditorCommand, PhraseEditor } from '@phrase/editor';

/**
 * The prompt of the "Link" button (ADR 0075): one field for where the link goes, with the address
 * of the link at the cursor in it already. Enter makes the selection a link, or moves the link that
 * the cursor is in; an empty field takes that link off. The editor decides what is allowed.
 */

export interface LinkPromptHost {
  /** The editor, or nothing while there is none. */
  editor(): PhraseEditor | undefined;
  /** Shows what a command answered. A refusal with a fix offers it (ADR 0026). */
  answered(command: EditorCommand, result: CommandResult): void;
}

export interface LinkPrompt {
  open(): void;
  close(): void;
}

export function createLinkPrompt(root: HTMLElement, host: LinkPromptHost): LinkPrompt {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Link');
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', 'Where the link goes');
  input.placeholder = 'https://\u2026, mailto:\u2026 or #id';
  const hint = document.createElement('p');
  hint.className = 'hint';
  root.replaceChildren(input, hint);

  let existing = false;

  function close(refocus: boolean): void {
    if (root.hidden) return;
    root.hidden = true;
    if (refocus) host.editor()?.focus();
  }

  function apply(): void {
    const editor = host.editor();
    const href = input.value.trim();
    if (editor === undefined) {
      close(false);
      return;
    }
    if (href === '' && !existing) {
      close(true);
      return;
    }
    const command: EditorCommand =
      href === '' ? { type: 'remove-link' } : { type: 'set-link', href };
    const result = editor.run(command);
    if (!result.ok && result.reason === 'invalid-argument') {
      // The field stays open, so that the address can be put right.
      hint.textContent = result.message;
      return;
    }
    close(false);
    host.answered(command, result);
    editor.focus();
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });
  root.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node && root.contains(event.relatedTarget))) close(false);
  });

  return {
    open() {
      const editor = host.editor();
      if (editor === undefined) return;
      const href = editor.getLinkHref();
      existing = href !== undefined;
      input.value = href ?? '';
      hint.textContent = existing
        ? 'Enter changes where the link goes. Empty takes the link off.'
        : 'Enter makes the selected text a link.';
      root.hidden = false;
      input.focus();
      input.select();
    },
    close() {
      close(true);
    },
  };
}
