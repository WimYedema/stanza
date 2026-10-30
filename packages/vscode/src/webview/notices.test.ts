// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { StyleName } from '@phrase/core';
import type { CommandResult, EditorCommand } from '@phrase/editor';
import type { WebviewMessage } from '../shared/protocol.js';
import { createNotices } from './notices.js';

const command: EditorCommand = { type: 'toggle-mark', mark: 'strong' };
const refusal: CommandResult = {
  ok: false,
  reason: 'mark-not-allowed',
  message: 'The style "plain" does not allow strong.',
  fix: { kind: 'declare-variant', style: 'plain' as StyleName, mark: 'strong' },
};
const refusalWithoutFix: CommandResult = {
  ok: false,
  reason: 'not-applicable',
  message: 'Put the cursor in a block of text.',
};

function setup(answer: CommandResult | undefined = { ok: true }) {
  const root = document.createElement('div');
  const sent: WebviewMessage[] = [];
  const run = vi.fn<(command: EditorCommand) => CommandResult | undefined>(() => answer);
  const notices = createNotices(
    root,
    (message) => sent.push(message),
    (given) => run(given),
  );
  const button = () => root.querySelector('button');
  return { root, sent, run, notices, button };
}

describe('the notices', () => {
  it('show a refusal, and offer the fix as a button that sends nothing until it is clicked', () => {
    const { root, sent, notices, button } = setup();
    notices.answered(command, refusal);
    expect(root.textContent).toContain(
      'mark-not-allowed: The style "plain" does not allow strong.',
    );
    expect(button()?.textContent).toBe('Allow strong in plain');
    expect(sent).toEqual([]);

    button()?.click();
    expect(sent).toEqual([{ type: 'declare-variant', style: 'plain', mark: 'strong' }]);
    expect(root.textContent).toContain('Declaring strong in the style plain');
  });

  it('offer nothing for a refusal that no variant would remove', () => {
    const { root, notices, button } = setup();
    notices.answered(command, refusalWithoutFix);
    expect(root.textContent).toBe('not-applicable: Put the cursor in a block of text.');
    expect(button()).toBeNull();
  });

  it('clear the line when a command is done', () => {
    const { root, notices } = setup();
    notices.answered(command, refusal);
    notices.answered(command, { ok: true });
    expect(root.textContent).toBe('');
  });

  it('try the refused command again, once, when the variant is declared', () => {
    const { root, run, notices, button } = setup({ ok: true });
    notices.answered(command, refusal);
    button()?.click();
    notices.declared(true, '');
    expect(run).toHaveBeenCalledExactlyOnceWith(command);
    expect(root.textContent).toBe('');
    notices.declared(true, '');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('show a second refusal with its own button, and do not try a third time on their own', () => {
    const { root, run, notices, button } = setup(refusal);
    notices.answered(command, refusal);
    button()?.click();
    notices.declared(true, '');
    expect(run).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('does not allow strong');
    expect(button()).not.toBeNull();
  });

  it('say why when the variant could not be declared, and do not try again', () => {
    const { root, run, notices, button } = setup();
    notices.answered(command, refusal);
    button()?.click();
    notices.declared(false, 'The stylesheet has no paragraph style "plain".');
    expect(root.textContent).toBe('The stylesheet has no paragraph style "plain".');
    expect(run).not.toHaveBeenCalled();
  });

  it('do not run anything for an answer to a request that this page did not make', () => {
    const { run, notices } = setup();
    notices.declared(true, '');
    expect(run).not.toHaveBeenCalled();
  });
});
