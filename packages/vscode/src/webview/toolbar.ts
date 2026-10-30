import type { StyleName } from '@phrase/core';
import type { CommandResult, EditorCommand, PhraseEditor } from '@phrase/editor';

/**
 * A sketch of a toolbar: one button for each command, and lists of styles, so that the editor can
 * be used. Item 52 of the backlog replaces it with one that shows the state at the cursor.
 */
const BUTTONS: readonly (readonly [string, EditorCommand])[] = [
  ['Bold', { type: 'toggle-mark', mark: 'strong' }],
  ['Italic', { type: 'toggle-mark', mark: 'emphasis' }],
  ['Code', { type: 'toggle-mark', mark: 'code' }],
  ['H1', { type: 'set-heading', level: 1 }],
  ['H2', { type: 'set-heading', level: 2 }],
  ['H3', { type: 'set-heading', level: 3 }],
  ['Paragraph', { type: 'set-paragraph' }],
  ['Bullets', { type: 'toggle-list', kind: 'bulleted' }],
  ['Numbers', { type: 'toggle-list', kind: 'numbered' }],
  ['Sink', { type: 'sink-list-item' }],
  ['Lift', { type: 'lift-list-item' }],
  ['Code block', { type: 'toggle-code-block' }],
  ['Table', { type: 'insert-table', columns: 3, rows: 2 }],
  ['+ Row', { type: 'add-row', where: 'after' }],
  ['+ Column', { type: 'add-column', where: 'after' }],
  ['- Row', { type: 'delete-row' }],
  ['- Column', { type: 'delete-column' }],
  ['Contents', { type: 'insert-phrase-block', kind: 'toc', text: 'depth: 2' }],
];

export interface ToolbarHost {
  /** The editor, or nothing while there is none. */
  editor(): PhraseEditor | undefined;
  /** Shows what a command answered. A refusal with a fix offers it (ADR 0026). */
  answered(command: EditorCommand, result: CommandResult): void;
}

/** A click on the toolbar must not take the selection away from the editor. */
export const keepSelection = (element: HTMLElement): void => {
  element.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
};

function addOption(select: HTMLSelectElement, value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
  return option;
}

/** Disables an option that would be refused for good, and marks one that a declared variant fixes. */
function checked(option: HTMLOptionElement, label: string, result: CommandResult): void {
  if (result.ok) return;
  option.title = result.message;
  if (result.fix === undefined) option.disabled = true;
  else option.textContent = `${label} (needs ${result.fix.mark})`;
}

/**
 * The lists of styles. What they offer depends on the selection, so they are filled when they are
 * used, with each option checked against the stylesheet.
 */
function addStyleLists(container: HTMLElement, host: ToolbarHost): void {
  const styles = document.createElement('select');
  styles.title = 'Style of the block, or of the table';
  const characters = document.createElement('select');
  characters.title = 'Character style';
  addOption(styles, '', '(default)');
  addOption(characters, '', 'Character style');

  const fillStyles = (editor: PhraseEditor): void => {
    const context = editor.getContext();
    const names =
      context.block === 'table-cell' ? context.available.table : context.available.paragraph;
    styles.replaceChildren();
    styles.disabled = context.block === undefined;
    checked(
      addOption(styles, '', '(default)'),
      '(default)',
      editor.check({ type: 'set-style', style: null }),
    );
    for (const name of names) {
      checked(
        addOption(styles, name, name),
        name,
        editor.check({ type: 'set-style', style: name }),
      );
    }
    styles.value = context.style ?? '';
  };

  const fillCharacters = (editor: PhraseEditor): void => {
    const context = editor.getContext();
    characters.replaceChildren();
    addOption(characters, '', 'Character style');
    for (const name of context.available.character) {
      const label = context.characterStyles.includes(name) ? `${name} (on)` : name;
      checked(
        addOption(characters, name, label),
        label,
        editor.check({ type: 'toggle-character-style', style: name }),
      );
    }
    characters.value = '';
  };

  for (const event of ['focus', 'mousedown'] as const) {
    styles.addEventListener(event, () => {
      const editor = host.editor();
      if (editor !== undefined) fillStyles(editor);
    });
    characters.addEventListener(event, () => {
      const editor = host.editor();
      if (editor !== undefined) fillCharacters(editor);
    });
  }
  styles.addEventListener('change', () => {
    const editor = host.editor();
    if (editor === undefined) return;
    const command: EditorCommand = {
      type: 'set-style',
      style: styles.value === '' ? null : (styles.value as StyleName),
    };
    host.answered(command, editor.run(command));
    // What the list shows is what the block has, also when the command was refused.
    fillStyles(editor);
  });
  characters.addEventListener('change', () => {
    const editor = host.editor();
    if (editor === undefined || characters.value === '') return;
    const command: EditorCommand = {
      type: 'toggle-character-style',
      style: characters.value as StyleName,
    };
    host.answered(command, editor.run(command));
    characters.value = '';
  });
  container.append(styles, characters);
}

/** Fills the toolbar. */
export function buildToolbar(container: HTMLElement, host: ToolbarHost): void {
  for (const [label, command] of BUTTONS) {
    const button = document.createElement('button');
    button.textContent = label;
    keepSelection(button);
    button.addEventListener('click', () => {
      const editor = host.editor();
      if (editor !== undefined) host.answered(command, editor.run(command));
    });
    container.append(button);
  }
  addStyleLists(container, host);
}
