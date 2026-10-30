import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH, parseHostMessage, parseWebviewMessage } from './protocol.js';

describe('parseWebviewMessage', () => {
  it('takes the messages of the protocol', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'format', extra: 1 })).toEqual({ type: 'format' });
    expect(parseWebviewMessage({ type: 'open-as-text' })).toEqual({ type: 'open-as-text' });
    expect(parseWebviewMessage({ type: 'change', text: 'a\n' })).toEqual({
      type: 'change',
      text: 'a\n',
    });
  });

  it.each([
    undefined,
    null,
    'ready',
    42,
    [],
    {},
    { type: 'nope' },
    { type: 'change' },
    { type: 'change', text: 5 },
    { type: 'change', text: 'x'.repeat(MAX_TEXT_LENGTH + 1) },
  ])('refuses %j', (value) => {
    expect(parseWebviewMessage(value)).toBeUndefined();
  });
});

describe('parseHostMessage', () => {
  it('takes the messages of the protocol', () => {
    const init = { type: 'init', documentText: 'a', stylesheetText: 'b', usedIds: ['x'] };
    expect(parseHostMessage(init)).toEqual(init);
    expect(parseHostMessage({ type: 'external-text', text: 'a' })).toEqual({
      type: 'external-text',
      text: 'a',
    });
    expect(parseHostMessage({ type: 'stylesheet', text: 'a' })).toEqual({
      type: 'stylesheet',
      text: 'a',
    });
    expect(parseHostMessage({ type: 'used-ids', ids: [] })).toEqual({ type: 'used-ids', ids: [] });
    const refused = {
      type: 'refused',
      title: 'T',
      reasons: [{ message: 'M', line: 3 }, { message: 'N' }],
      canFormat: true,
    };
    expect(parseHostMessage(refused)).toEqual(refused);
  });

  it.each([
    null,
    { type: 'init', documentText: 'a', stylesheetText: 'b', usedIds: [1] },
    { type: 'init', documentText: 'a', usedIds: [] },
    { type: 'external-text' },
    { type: 'used-ids', ids: 'x' },
    { type: 'refused', title: 'T', reasons: [{ line: 1 }], canFormat: true },
    { type: 'refused', title: 'T', reasons: [], canFormat: 'yes' },
    { type: 'other' },
  ])('refuses %j', (value) => {
    expect(parseHostMessage(value)).toBeUndefined();
  });
});
