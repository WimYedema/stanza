// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Document } from '@stanza/core';
import type { CommandResult, EditorCommand, StanzaEditor } from '@stanza/editor';
import { parseDocument } from '@stanza/format';
import { createReferencePicker, type ReferencePicker } from './reference-picker.js';

const TEXT = `---
stanza-format: 1
title: "T"
---

<!-- stanza: #aaaaaaaaaa -->
# Threat Model

<!-- stanza: #bbbbbbbbbb -->
## S1 \u2014 Unauthorised sign-in

<!-- stanza: #cccccccccc -->
## I5 \u2014 Secrets exposed in documents

<!-- stanza: #dddddddddd -->
## T6 \u2014 Pipeline changes

See I5.
`;

const parsed: Document = parseDocument(TEXT).document;

// jsdom does not scroll.
Element.prototype.scrollIntoView = vi.fn();

let root: HTMLElement;
let picker: ReferencePicker;
let selected = '';
let document_: Document | undefined = parsed;
const run = vi.fn<(command: EditorCommand) => CommandResult>(() => ({ ok: true }));
const focus = vi.fn<() => void>();
const answered = vi.fn<(command: EditorCommand, result: CommandResult) => void>();

const editor = {
  getDocument: () => ({ document: document_, diagnostics: [] }),
  getSelectedText: () => selected,
  run,
  focus,
} as unknown as StanzaEditor;

beforeEach(() => {
  root = document.createElement('div');
  root.hidden = true;
  document.body.append(root);
  selected = '';
  document_ = parsed;
  run.mockClear();
  focus.mockClear();
  answered.mockClear();
  picker = createReferencePicker(root, { editor: () => editor, answered });
});
afterEach(() => {
  document.body.replaceChildren();
});

const input = (): HTMLInputElement => {
  const found = root.querySelector('input');
  if (found === null) throw new Error('No field.');
  return found;
};
const items = (): string[] => [...root.querySelectorAll('li')].map((item) => item.textContent);
const key = (name: string): void => {
  input().dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
};
const hint = (): string => root.querySelector('.hint')?.textContent ?? '';

describe('opening', () => {
  it('lists the headings in order when nothing is selected, and says where it will insert', () => {
    picker.open();
    expect(root.hidden).toBe(false);
    expect(items()).toEqual([
      'Threat Model',
      'S1 \u2014 Unauthorised sign-in',
      'I5 \u2014 Secrets exposed in documents',
      'T6 \u2014 Pipeline changes',
    ]);
    expect(hint()).toContain('inserted at the cursor');
    expect(document.activeElement).toBe(input());
  });

  it('puts the best match for the selected text first, and says that the text stays', () => {
    selected = 'I5';
    picker.open();
    expect(input().value).toBe('I5');
    expect(items()).toEqual(['I5 \u2014 Secrets exposed in documents']);
    expect(hint()).toContain('stays as it is');
  });

  it('lists all the headings, and says so, when none matches the selection', () => {
    selected = 'something else entirely';
    picker.open();
    expect(items()).toHaveLength(4);
    expect(hint()).toContain('No heading matches');
  });

  it('says so when the document cannot be read, or has no headings', () => {
    document_ = undefined;
    picker.open();
    expect(hint()).toContain('cannot be read');
    document_ = parseDocument('---\nstanza-format: 1\n---\n\nJust text.\n').document;
    picker.open();
    expect(hint()).toContain('no headings');
  });

  it('does nothing without an editor', () => {
    const none = createReferencePicker(root, { editor: () => undefined, answered });
    none.open();
    expect(root.hidden).toBe(true);
  });
});

describe('looking for a heading', () => {
  it('narrows the list as the field is typed in', () => {
    picker.open();
    input().value = 'pipeline';
    input().dispatchEvent(new Event('input'));
    expect(items()).toEqual(['T6 \u2014 Pipeline changes']);
  });

  it('moves with the arrows, round the ends', () => {
    picker.open();
    const selectedItem = (): string | undefined =>
      [...root.querySelectorAll('li')].find((i) => i.getAttribute('aria-selected') === 'true')
        ?.textContent;
    expect(selectedItem()).toBe('Threat Model');
    key('ArrowDown');
    expect(selectedItem()).toBe('S1 \u2014 Unauthorised sign-in');
    key('ArrowUp');
    key('ArrowUp');
    expect(selectedItem()).toBe('T6 \u2014 Pipeline changes');
    key('ArrowDown');
    expect(selectedItem()).toBe('Threat Model');
  });
});

describe('opened by typing @', () => {
  it('lists all the headings, and has the @ replaced by the reference that is chosen', () => {
    picker.open({ replaces: '@' });
    expect(root.hidden).toBe(false);
    expect(items()).toHaveLength(4);
    key('ArrowDown');
    key('Enter');
    expect(run).toHaveBeenLastCalledWith({
      type: 'set-reference',
      id: 'bbbbbbbbbb',
      text: 'S1 \u2014 Unauthorised sign-in',
      replaces: '@',
    });
  });

  it('does not open when there is no heading to offer, so the @ is only text', () => {
    document_ = parseDocument('---\nstanza-format: 1\n---\n\nJust text.\n').document;
    picker.open({ replaces: '@' });
    expect(root.hidden).toBe(true);
    document_ = undefined;
    picker.open({ replaces: '@' });
    expect(root.hidden).toBe(true);
  });

  it('does not replace anything when opened another way afterwards', () => {
    picker.open({ replaces: '@' });
    key('Escape');
    picker.open();
    key('Enter');
    expect(run.mock.calls.at(-1)?.[0]).not.toHaveProperty('replaces');
  });
});

describe('choosing', () => {
  it('turns the selection into a reference with Enter, and gives the focus back', () => {
    selected = 'I5';
    picker.open();
    key('Enter');
    const command = {
      type: 'set-reference',
      id: 'cccccccccc',
      text: 'I5 \u2014 Secrets exposed in documents',
    };
    expect(run).toHaveBeenCalledWith(command);
    expect(answered).toHaveBeenCalledWith(command, { ok: true });
    expect(root.hidden).toBe(true);
    expect(focus).toHaveBeenCalled();
  });

  it('inserts the text of the heading when nothing is selected', () => {
    picker.open();
    root.querySelectorAll('li')[3]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(run).toHaveBeenLastCalledWith({
      type: 'set-reference',
      id: 'dddddddddd',
      text: 'T6 \u2014 Pipeline changes',
    });
    picker.open();
    root.querySelectorAll('li')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(run).toHaveBeenLastCalledWith({
      type: 'set-reference',
      id: 'aaaaaaaaaa',
      text: 'Threat Model',
    });
  });

  it('keeps the selected text, whatever the heading says', () => {
    selected = 'I5';
    picker.open();
    key('Enter');
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'cccccccccc' }));
  });

  it('hands over a refusal, so that its fix can be offered', () => {
    run.mockReturnValueOnce({ ok: false, reason: 'mark-not-allowed', message: 'No links here.' });
    selected = 'I5';
    picker.open();
    key('Enter');
    expect(answered).toHaveBeenCalledWith(expect.anything(), {
      ok: false,
      reason: 'mark-not-allowed',
      message: 'No links here.',
    });
  });

  it('closes with Escape and changes nothing', () => {
    picker.open();
    key('Escape');
    expect(root.hidden).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it('closes when the focus goes elsewhere, without taking it back', () => {
    picker.open();
    input().dispatchEvent(
      new FocusEvent('focusout', { relatedTarget: document.body, bubbles: true }),
    );
    expect(root.hidden).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });

  it('does not close when the focus stays inside the list', () => {
    picker.open();
    const inside = root.querySelector('li') ?? document.body;
    input().dispatchEvent(new FocusEvent('focusout', { relatedTarget: inside, bubbles: true }));
    expect(root.hidden).toBe(false);
  });
});
