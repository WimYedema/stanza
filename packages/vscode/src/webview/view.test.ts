// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIEW,
  ZOOM_STEPS,
  buildViewControls,
  parseViewState,
  type ViewState,
} from './view.js';

describe('parseViewState', () => {
  it('takes what was kept', () => {
    expect(parseViewState({ mode: 'plain', zoom: 150 })).toEqual({ mode: 'plain', zoom: 150 });
  });

  it.each([undefined, null, 'x', { mode: 'wide', zoom: 99 }, { zoom: '125' }])(
    'falls back to the default for %j',
    (value) => {
      expect(parseViewState(value)).toEqual(DEFAULT_VIEW);
    },
  );
});

describe('the controls of the view', () => {
  let container: HTMLElement;
  let desk: HTMLElement;
  const keep = vi.fn<(state: ViewState) => void>();

  beforeEach(() => {
    container = document.createElement('div');
    desk = document.createElement('div');
    keep.mockClear();
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  const button = (label: string): HTMLButtonElement => {
    const found = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
    if (found === undefined) throw new Error(`No button ${label}.`);
    return found;
  };

  it('shows the sheet at 100% at first, and tells what it shows', () => {
    buildViewControls(container, desk, DEFAULT_VIEW, keep);
    expect(desk.classList.contains('paper')).toBe(true);
    expect(desk.classList.contains('plain')).toBe(false);
    expect(desk.classList.contains('zoom-100')).toBe(true);
    expect(button('Sheet').getAttribute('aria-pressed')).toBe('true');
    expect(keep).toHaveBeenLastCalledWith(DEFAULT_VIEW);
  });

  it('switches between the sheet and the plain page', () => {
    buildViewControls(container, desk, DEFAULT_VIEW, keep);
    button('Sheet').click();
    expect(desk.classList.contains('plain')).toBe(true);
    expect(desk.classList.contains('paper')).toBe(false);
    expect(button('Sheet').getAttribute('aria-pressed')).toBe('false');
    expect(keep).toHaveBeenLastCalledWith({ mode: 'plain', zoom: 100 });
    button('Sheet').click();
    expect(desk.classList.contains('paper')).toBe(true);
  });

  it('zooms through the steps, stops at the ends, and goes back to 100%', () => {
    buildViewControls(container, desk, DEFAULT_VIEW, keep);
    button('+').click();
    expect(desk.classList.contains('zoom-125')).toBe(true);
    expect(desk.classList.contains('zoom-100')).toBe(false);
    expect(button('125%').title).toBe('Back to 100%');
    button('125%').click();
    expect(desk.classList.contains('zoom-100')).toBe(true);

    for (let click = 0; click < ZOOM_STEPS.length; click += 1) button('\u2212').click();
    expect(desk.classList.contains('zoom-50')).toBe(true);
    expect(button('\u2212').disabled).toBe(true);
    expect(keep).toHaveBeenLastCalledWith({ mode: 'sheet', zoom: 50 });
  });

  it('starts from the state that was kept', () => {
    buildViewControls(container, desk, { mode: 'plain', zoom: 200 }, keep);
    expect(desk.classList.contains('plain')).toBe(true);
    expect(desk.classList.contains('zoom-200')).toBe(true);
    expect(button('+').disabled).toBe(true);
  });

  it('does not take the selection away from the editor', () => {
    buildViewControls(container, desk, DEFAULT_VIEW, keep);
    const event = new MouseEvent('mousedown', { cancelable: true });
    button('+').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
