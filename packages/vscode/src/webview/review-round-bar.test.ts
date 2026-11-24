// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { WebviewMessage } from '../shared/protocol.js';
import { createReviewRoundBar, describeRound } from './review-round-bar.js';

function bar() {
  const sent: WebviewMessage[] = [];
  const made = createReviewRoundBar((message) => sent.push(message));
  document.body.replaceChildren(made.element);
  const buttons = [...made.element.querySelectorAll('button')];
  const named = (text: string): HTMLButtonElement => {
    const found = buttons.find((b) => b.textContent === text);
    if (found === undefined) throw new Error(`No button ${text}.`);
    return found;
  };
  const status = (): HTMLElement | null => made.element.querySelector('.review-round-status');
  return { made, sent, named, status };
}

describe('the review buttons (ADR 0088)', () => {
  it('stay hidden until the host says where the round stands', () => {
    const { made } = bar();
    expect(made.element.hidden).toBe(true);
    made.show({ kind: 'not-pushed' }, undefined);
    expect(made.element.hidden).toBe(false);
  });

  it('push to the remembered folder and pull, busy until the host is done', () => {
    const { made, sent, named, status } = bar();
    made.show({ kind: 'current' }, 'Review');
    expect(status()?.textContent).toBe('Pushed, no changes');
    named('Push').click();
    expect(sent).toEqual([{ type: 'review-push', mode: 'remembered' }]);
    expect(named('Pull').disabled).toBe(true);
    expect(status()?.textContent).toBe('Pushing…');
    // A status that comes meanwhile waits for the end of the push.
    made.show({ kind: 'changed' }, 'Review');
    expect(status()?.textContent).toBe('Pushing…');
    made.done();
    expect(status()?.textContent).toBe('Changed since push');
    named('Pull').click();
    expect(sent.at(-1)).toEqual({ type: 'review-pull' });
  });

  it('offer the other pushes and the folder in a menu that closes again', () => {
    const { sent, named, made } = bar();
    made.show({ kind: 'not-pushed' }, undefined);
    const menu = made.element.querySelector<HTMLElement>('.review-round-menu');
    expect(menu?.hidden).toBe(true);
    named('▾').click();
    expect(menu?.hidden).toBe(false);
    expect(named('▾').getAttribute('aria-expanded')).toBe('true');
    named('Push as a New File').click();
    expect(sent).toEqual([{ type: 'review-push', mode: 'new' }]);
    expect(menu?.hidden).toBe(true);
    made.done();
    named('▾').click();
    named('Open Review Folder').click();
    expect(sent.at(-1)).toEqual({ type: 'open-review-folder' });
    named('▾').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu?.hidden).toBe(true);
  });

  it('mark the button that is due', () => {
    const { made, named, status } = bar();
    made.show({ kind: 'unpulled', comments: 3, savedAt: '2026-11-24 17:37' }, 'Review');
    expect(status()?.textContent).toBe('● 3 new comments');
    expect(named('Pull').classList.contains('due')).toBe(true);
    expect(named('Push').classList.contains('due')).toBe(false);
    made.show({ kind: 'changed' }, 'Review');
    expect(named('Push').classList.contains('due')).toBe(true);
    expect(named('Pull').classList.contains('due')).toBe(false);
  });
});

describe('describeRound', () => {
  it('names each state, with the folder in the tooltip', () => {
    expect(describeRound({ kind: 'unpulled', comments: 1, savedAt: 'x' }, 'R').text).toBe(
      '● 1 new comment',
    );
    expect(describeRound({ kind: 'unpulled', comments: 0, savedAt: 'x' }, 'R').text).toBe(
      '● Saved by a reviewer',
    );
    expect(describeRound({ kind: 'not-pushed' }, undefined).title).toBe(
      'Push to choose a review folder for this document.',
    );
    expect(describeRound({ kind: 'not-this-document', message: 'Why.' }, 'R')).toEqual({
      text: 'Review file is not this document',
      title: 'Why.',
    });
  });
});
