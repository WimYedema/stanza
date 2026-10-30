import type { CommandResult, EditorCommand } from '@phrase/editor';
import type { WebviewMessage } from '../shared/protocol.js';
import { keepSelection } from './toolbar.js';

export interface Notices {
  /** Shows a line of text in place of what was there. */
  readonly say: (text: string) => void;
  /** Shows what a command answered. A refusal that a variant would remove offers to declare it. */
  readonly answered: (command: EditorCommand, result: CommandResult) => void;
  /** The host has answered `declare-variant`. On success the refused command is tried again. */
  readonly declared: (ok: boolean, message: string) => void;
}

/**
 * The line under the toolbar. A refusal that the stylesheet could remove carries the offer to do
 * that, as a button: nothing is declared until the person editing asks for it (ADR 0026). The
 * command that was refused is tried again once, when the host says that the variant is declared.
 */
export function createNotices(
  root: HTMLElement,
  send: (message: WebviewMessage) => void,
  run: (command: EditorCommand) => CommandResult | undefined,
): Notices {
  let retry: EditorCommand | undefined;

  const say = (text: string): void => {
    root.textContent = text;
  };

  const answered = (command: EditorCommand, result: CommandResult): void => {
    retry = undefined;
    if (result.ok) {
      say('');
      return;
    }
    say(`${result.reason}: ${result.message}`);
    const { fix } = result;
    if (fix === undefined) return;
    const button = document.createElement('button');
    button.textContent = `Allow ${fix.mark} in ${fix.style}`;
    keepSelection(button);
    button.addEventListener('click', () => {
      retry = command;
      say(`Declaring ${fix.mark} in the style ${fix.style}...`);
      send({ type: 'declare-variant', style: fix.style, mark: fix.mark });
    });
    root.append(' ', button);
  };

  return {
    say,
    answered,
    declared(ok, message) {
      const command = retry;
      retry = undefined;
      if (!ok) {
        say(message);
        return;
      }
      say('');
      const result = command === undefined ? undefined : run(command);
      if (command !== undefined && result !== undefined) answered(command, result);
    },
  };
}
