import { describe, expect, it } from 'vitest';
import { parseStylesHostMessage, parseStylesWebviewMessage } from './styles-protocol.js';

describe('parseStylesWebviewMessage', () => {
  it('takes the messages of the protocol', () => {
    expect(parseStylesWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseStylesWebviewMessage({ type: 'open-as-text', extra: 1 })).toEqual({
      type: 'open-as-text',
    });
  });

  it.each([null, 'ready', [], { type: 'other' }, { type: 5 }, {}])('refuses %j', (value) => {
    expect(parseStylesWebviewMessage(value)).toBeUndefined();
  });

  it('takes a change of a property, with a word, a number, a flag, a list or a mapping', () => {
    const path = ['paragraph-styles', 'body', 'size'];
    for (const value of [
      12,
      'center',
      true,
      ['Calibri', 'Arial'],
      { multiple: 1.15 },
      { width: 0.75, color: { nested: 'x' } },
    ]) {
      expect(parseStylesWebviewMessage({ type: 'set', path, value })).toEqual({
        type: 'set',
        path,
        value,
      });
    }
    expect(parseStylesWebviewMessage({ type: 'unset', path })).toEqual({ type: 'unset', path });
  });

  it.each([
    { type: 'set', path: [], value: 1 },
    { type: 'set', path: 'body', value: 1 },
    { type: 'set', path: ['a', 5], value: 1 },
    { type: 'set', path: ['a'] },
    { type: 'set', path: ['a'], value: null },
    { type: 'set', path: ['a'], value: Number.NaN },
    { type: 'set', path: ['a'], value: [1] },
    { type: 'set', path: ['a'], value: 'x'.repeat(501) },
    { type: 'set', path: ['a'], value: { a: { b: { c: { d: 1 } } } } },
    { type: 'set', path: Array.from({ length: 9 }, () => 'a'), value: 1 },
    { type: 'unset', path: [] },
    { type: 'unset' },
  ])('refuses %j', (value) => {
    expect(parseStylesWebviewMessage(value)).toBeUndefined();
  });

  it('takes the adding and the deleting of a style', () => {
    expect(
      parseStylesWebviewMessage({ type: 'add-style', kind: 'paragraph-style', name: 'note' }),
    ).toEqual({ type: 'add-style', kind: 'paragraph-style', name: 'note' });
    expect(
      parseStylesWebviewMessage({
        type: 'add-style',
        kind: 'table-style',
        name: 'grid',
        basedOn: 'table',
      }),
    ).toEqual({ type: 'add-style', kind: 'table-style', name: 'grid', basedOn: 'table' });
    expect(
      parseStylesWebviewMessage({ type: 'delete-style', kind: 'character-style', name: 'x' }),
    ).toEqual({ type: 'delete-style', kind: 'character-style', name: 'x' });
  });

  it.each([
    { type: 'add-style', kind: 'page-template', name: 'a' },
    { type: 'add-style', kind: 'table-style' },
    { type: 'add-style', kind: 'table-style', name: '' },
    { type: 'add-style', kind: 'table-style', name: 'a', basedOn: 5 },
    { type: 'add-style', kind: 'table-style', name: 'x'.repeat(201) },
    { type: 'delete-style', kind: 'color', name: 'a' },
    { type: 'delete-style', name: 'a' },
    { type: 'delete-style', kind: 'table-style' },
  ])('refuses %j', (value) => {
    expect(parseStylesWebviewMessage(value)).toBeUndefined();
  });
});

describe('parseStylesHostMessage', () => {
  it('takes the messages of the protocol', () => {
    expect(parseStylesHostMessage({ type: 'init', text: 'a' })).toEqual({
      type: 'init',
      text: 'a',
    });
    expect(parseStylesHostMessage({ type: 'text', text: '' })).toEqual({ type: 'text', text: '' });
    const refused = {
      type: 'refused',
      title: 'T',
      reasons: [{ message: 'M', line: 3 }, { message: 'N' }],
    };
    expect(parseStylesHostMessage(refused)).toEqual(refused);
    expect(parseStylesHostMessage({ type: 'edit-refused', message: 'No.' })).toEqual({
      type: 'edit-refused',
      message: 'No.',
    });
  });

  it.each([
    null,
    { type: 'init' },
    { type: 'text', text: 1 },
    { type: 'refused', title: 'T' },
    { type: 'refused', title: 'T', reasons: [{ line: 1 }] },
    { type: 'refused', title: 5, reasons: [] },
    { type: 'edit-refused' },
    { type: 'edit-refused', message: 1 },
    { type: 'other' },
  ])('refuses %j', (value) => {
    expect(parseStylesHostMessage(value)).toBeUndefined();
  });
});
