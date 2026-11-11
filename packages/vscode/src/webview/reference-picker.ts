import { suggestReferences, type Document, type ReferenceSuggestion } from '@phrase/core';
import type { CommandResult, EditorCommand, PhraseEditor } from '@phrase/editor';

/**
 * The list for "Make reference" (ADR 0069): the headings of the document, the best match for the
 * selected text first, to pick one and turn the selection into a reference to it. With nothing
 * selected the reference is inserted at the cursor. It is built from the document in the editor,
 * saved or not, so it needs nothing from the extension host.
 */

export interface ReferencePickerHost {
  /** The editor, or nothing while there is none. */
  editor(): PhraseEditor | undefined;
  /** Shows what a command answered. A refusal with a fix offers it (ADR 0026). */
  answered(command: EditorCommand, result: CommandResult): void;
}

export interface ReferencePicker {
  /** Shows the list for the selection that the editor has now. */
  open(): void;
  close(): void;
}

const INDENT_PX = 12;

export function createReferencePicker(
  root: HTMLElement,
  host: ReferencePickerHost,
): ReferencePicker {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Make reference');
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', 'Heading to refer to');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  const hint = document.createElement('p');
  hint.className = 'hint';
  const list = document.createElement('ul');
  list.id = 'reference-list';
  list.setAttribute('role', 'listbox');
  input.setAttribute('aria-controls', list.id);
  root.replaceChildren(input, hint, list);

  let headings: Document | undefined;
  let selected = '';
  let shown: readonly ReferenceSuggestion[] = [];
  let active = 0;

  function close(refocus: boolean): void {
    if (root.hidden) return;
    root.hidden = true;
    if (refocus) host.editor()?.focus();
  }

  function pick(suggestion: ReferenceSuggestion): void {
    const editor = host.editor();
    close(false);
    if (editor === undefined) return;
    const command: EditorCommand = {
      type: 'set-reference',
      id: suggestion.id,
      text: suggestion.label,
    };
    host.answered(command, editor.run(command));
    editor.focus();
  }

  function markActive(): void {
    [...list.children].forEach((item, index) => {
      item.setAttribute('aria-selected', String(index === active));
      if (index === active) {
        input.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function draw(): void {
    shown = headings === undefined ? [] : suggestReferences(headings, input.value);
    active = 0;
    const looking = input.value.trim() !== '';
    const none = looking && shown.length > 0 && shown.every((s) => s.match === undefined);
    if (headings === undefined) hint.textContent = 'The document cannot be read now.';
    else if (shown.length === 0) hint.textContent = 'This document has no headings to refer to.';
    else if (none) hint.textContent = 'No heading matches. All headings are listed.';
    else if (selected === '')
      hint.textContent = 'Nothing is selected: the reference is inserted at the cursor.';
    else hint.textContent = 'The selected text stays as it is.';
    list.replaceChildren(
      ...shown.map((suggestion, index) => {
        const item = document.createElement('li');
        item.id = `reference-${String(index)}`;
        item.setAttribute('role', 'option');
        item.textContent = suggestion.text;
        item.title = suggestion.text;
        item.style.paddingLeft = `${String((suggestion.level - 1) * INDENT_PX + 8)}px`;
        // The list must not take the focus from the field.
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        item.addEventListener('click', () => {
          pick(suggestion);
        });
        return item;
      }),
    );
    markActive();
  }

  input.addEventListener('input', draw);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length === 0) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      markActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = shown[active];
      if (chosen !== undefined) pick(chosen);
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
      headings = editor.getDocument().document;
      selected = editor.getSelectedText().replace(/\s+/g, ' ').trim();
      input.value = selected;
      root.hidden = false;
      draw();
      input.focus();
      input.select();
    },
    close() {
      close(true);
    },
  };
}
