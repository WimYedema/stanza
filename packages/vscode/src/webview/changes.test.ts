// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChangesBar } from './changes.js';

let root: HTMLElement;
const next = vi.fn();
const dismiss = vi.fn();

const button = (label: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((node) => node.textContent === label);
  if (found === undefined) throw new Error(`No button ${label}.`);
  return found;
};

beforeEach(() => {
  root = document.createElement('div');
  root.hidden = true;
  next.mockReset();
  dismiss.mockReset();
});

describe('the changes bar', () => {
  it('says how many blocks changed and how many were removed', () => {
    const bar = createChangesBar(root, { next, dismiss });
    bar.show(3, 1);
    expect(root.hidden).toBe(false);
    expect(root.querySelector('span')?.textContent).toBe(
      'Changed from outside: 3 blocks changed, 1 block removed',
    );
    bar.show(1, 0);
    expect(root.querySelector('span')?.textContent).toBe('Changed from outside: 1 block changed');
    bar.show(0, 2);
    expect(root.querySelector('span')?.textContent).toBe('Changed from outside: 2 blocks removed');
  });

  it('is hidden when nothing is changed or removed, and shows again', () => {
    const bar = createChangesBar(root, { next, dismiss });
    bar.show(2, 0);
    bar.show(0, 0);
    expect(root.hidden).toBe(true);
    bar.show(1, 0);
    expect(root.hidden).toBe(false);
  });

  it('has no next change to go to when only removals are left', () => {
    const bar = createChangesBar(root, { next, dismiss });
    bar.show(0, 1);
    expect(button('Next change').disabled).toBe(true);
    bar.show(2, 1);
    expect(button('Next change').disabled).toBe(false);
  });

  it('runs the actions of its buttons', () => {
    createChangesBar(root, { next, dismiss }).show(1, 0);
    button('Next change').click();
    button('Dismiss').click();
    expect(next).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
