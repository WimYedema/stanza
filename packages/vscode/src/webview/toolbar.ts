import type { CommandResult, EditorCommand } from '@phrase/editor';

/**
 * A sketch of a toolbar: one button for each command, so that the editor can be used. Item 52 of the
 * backlog replaces it with one that shows the state at the cursor.
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

/** Fills the toolbar. `run` is the editor's `run`, or nothing while there is no editor. */
export function buildToolbar(
  container: HTMLElement,
  run: (command: EditorCommand) => CommandResult | undefined,
  say: (text: string) => void,
): void {
  for (const [label, command] of BUTTONS) {
    const button = document.createElement('button');
    button.textContent = label;
    // A click must not take the selection away from the editor.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      const result = run(command);
      say(result === undefined || result.ok ? '' : `${result.reason}: ${result.message}`);
    });
    container.append(button);
  }
}
