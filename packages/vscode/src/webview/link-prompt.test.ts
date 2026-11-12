// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, EditorCommand, PhraseEditor } from '@phrase/editor';
import { createLinkPrompt, type LinkPrompt } from './link-prompt.js';

let root: HTMLElement;
let prompt: LinkPrompt;
let href: string | undefined;
let answer: CommandResult = { ok: true };
const run = vi.fn<(command: EditorCommand) => CommandResult>(() => answer);
const focus = vi.fn<() => void>();
const answered = vi.fn<(command: EditorCommand, result: CommandResult) => void>();

const editor = { getLinkHref: () => href, run, focus } as unknown as PhraseEditor;

beforeEach(() => {
  root = document.createElement('div');
  root.hidden = true;
  document.body.append(root);
  href = undefined;
  answer = { ok: true };
  run.mockClear();
  focus.mockClear();
  answered.mockClear();
  prompt = createLinkPrompt(root, { editor: () => editor, answered });
});
afterEach(() => {
  document.body.replaceChildren();
});

const input = (): HTMLInputElement => {
  const found = root.querySelector('input');
  if (found === null) throw new Error('No field.');
  return found;
};
const type = (value: string, key = 'Enter'): void => {
  input().value = value;
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

describe('the link prompt', () => {
  it('makes the selection a link and gives the focus back', () => {
    prompt.open();
    expect(root.hidden).toBe(false);
    expect(input().value).toBe('');
    type('  https://example.atlassian.net/browse/PROJ-123 ');
    const command = { type: 'set-link', href: 'https://example.atlassian.net/browse/PROJ-123' };
    expect(run).toHaveBeenCalledWith(command);
    expect(answered).toHaveBeenCalledWith(command, { ok: true });
    expect(root.hidden).toBe(true);
    expect(focus).toHaveBeenCalled();
  });

  it('starts with the address of the link at the cursor, and an empty field takes it off', () => {
    href = 'https://example.org/a';
    prompt.open();
    expect(input().value).toBe('https://example.org/a');
    type('');
    expect(run).toHaveBeenCalledWith({ type: 'remove-link' });
    expect(root.hidden).toBe(true);
  });

  it('does nothing for an empty field where there is no link', () => {
    prompt.open();
    type('');
    expect(run).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
  });

  it('stays open with the reason when the address is not allowed', () => {
    answer = { ok: false, reason: 'invalid-argument', message: 'A link goes to a web page.' };
    prompt.open();
    type('jira://PROJ-123');
    expect(root.hidden).toBe(false);
    expect(root.querySelector('.hint')?.textContent).toBe('A link goes to a web page.');
    expect(answered).not.toHaveBeenCalled();
  });

  it('passes other refusals on, so that a missing variant can be offered', () => {
    answer = { ok: false, reason: 'not-applicable', message: 'Select the text to link.' };
    prompt.open();
    type('https://a.b');
    expect(root.hidden).toBe(true);
    expect(answered).toHaveBeenCalledWith({ type: 'set-link', href: 'https://a.b' }, answer);
  });

  it('closes on Escape without a change', () => {
    prompt.open();
    type('https://a.b', 'Escape');
    expect(run).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
    expect(focus).toHaveBeenCalled();
  });
});
