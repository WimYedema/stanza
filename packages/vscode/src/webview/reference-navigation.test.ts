// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { installReferenceNavigation } from './reference-navigation.js';

const installed: ReturnType<typeof installReferenceNavigation>[] = [];
afterEach(() => {
  for (const navigation of installed) navigation.dispose();
  installed.length = 0;
});
const install: typeof installReferenceNavigation = (...args) => {
  const navigation = installReferenceNavigation(...args);
  installed.push(navigation);
  return navigation;
};

describe('reference navigation', () => {
  it('hints on hover, changes the modifier affordance, and acknowledges navigation immediately', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a href="other.phrase.md#aaaaaaaaaa"><strong>Other</strong></a>';
    const follow = vi.fn();
    const status = vi.fn();
    const navigation = install(root, follow, status);
    const link = root.querySelector('a');
    const child = root.querySelector('strong');
    child?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(link?.title).toContain('Ctrl+click');
    expect(link?.classList.contains('reference-hover')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }));
    expect(root.classList.contains('reference-mode')).toBe(true);
    child?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, ctrlKey: true, cancelable: true }),
    );
    expect(follow).toHaveBeenCalledWith('other.phrase.md#aaaaaaaaaa');
    expect(status).toHaveBeenCalledWith('Opening other.phrase.md#aaaaaaaaaa...');
    expect(root.getAttribute('aria-busy')).toBe('true');
    child?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, ctrlKey: true, cancelable: true }),
    );
    expect(follow).toHaveBeenCalledTimes(1);
    navigation.finish();
    expect(root.hasAttribute('aria-busy')).toBe(false);
    window.dispatchEvent(new Event('blur'));
    expect(root.classList.contains('reference-mode')).toBe(false);
  });

  it('follows an internal reference on Ctrl-click and prevents page navigation', () => {
    const root = document.createElement('div');
    const link = document.createElement('a');
    link.href = '#a1b2c3d4e5';
    const text = document.createElement('span');
    link.append(text);
    root.append(link);
    const follow = vi.fn();
    install(root, follow);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    text.dispatchEvent(event);

    expect(follow).toHaveBeenCalledWith('#a1b2c3d4e5');
    expect(event.defaultPrevented).toBe(true);
  });

  it('follows a reference on Cmd-click but not on an ordinary click', () => {
    const root = document.createElement('div');
    const link = document.createElement('a');
    link.href = '#a1b2c3d4e5';
    root.append(link);
    const follow = vi.fn();
    install(root, follow);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(follow).not.toHaveBeenCalled();

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
    expect(follow).toHaveBeenCalledWith('#a1b2c3d4e5');
  });

  it('leaves web links alone and sends unsupported fragments to the host for an actionable error', () => {
    const root = document.createElement('div');
    const external = document.createElement('a');
    external.href = 'https://example.org';
    const malformed = document.createElement('a');
    malformed.href = '#not-an-id';
    root.append(external, malformed);
    const follow = vi.fn();
    install(root, follow);

    external.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
    );
    malformed.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
    );

    expect(follow).toHaveBeenCalledExactlyOnceWith('#not-an-id');
  });
});
