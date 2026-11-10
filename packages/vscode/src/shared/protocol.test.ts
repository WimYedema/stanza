import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH, parseHostMessage, parseWebviewMessage } from './protocol.js';

describe('parseWebviewMessage', () => {
  it('takes the messages of the protocol', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'format', extra: 1 })).toEqual({ type: 'format' });
    expect(parseWebviewMessage({ type: 'open-as-text' })).toEqual({ type: 'open-as-text' });
    expect(parseWebviewMessage({ type: 'edit-styles' })).toEqual({ type: 'edit-styles' });
    expect(parseWebviewMessage({ type: 'change', text: 'a\n' })).toEqual({
      type: 'change',
      text: 'a\n',
    });
    expect(parseWebviewMessage({ type: 'declare-variant', style: 'body', mark: 'strong' })).toEqual(
      {
        type: 'declare-variant',
        style: 'body',
        mark: 'strong',
      },
    );
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
    { type: 'declare-variant', style: 'body' },
    { type: 'declare-variant', style: 5, mark: 'strong' },
    { type: 'declare-variant', style: 'x'.repeat(201), mark: 'strong' },
  ])('refuses %j', (value) => {
    expect(parseWebviewMessage(value)).toBeUndefined();
  });
});

describe('parseHostMessage', () => {
  it('takes the usage of the styles', () => {
    const usage = {
      type: 'usage',
      usage: {
        current: 'documents/a.phrase.md',
        paragraph: {
          body: [{ file: 'documents/a.phrase.md', direct: 0, default: 4, inherited: 1 }],
        },
        character: {},
        table: {},
      },
    };
    expect(parseHostMessage(usage)).toEqual(usage);
  });

  it.each([
    { type: 'usage' },
    { type: 'usage', usage: { current: 'a', paragraph: {}, character: {} } },
    { type: 'usage', usage: { current: 5, paragraph: {}, character: {}, table: {} } },
    { type: 'usage', usage: { current: 'a', paragraph: { body: 1 }, character: {}, table: {} } },
    {
      type: 'usage',
      usage: {
        current: 'a',
        paragraph: { body: [{ file: 'a', direct: -1, default: 0, inherited: 0 }] },
        character: {},
        table: {},
      },
    },
    {
      type: 'usage',
      usage: {
        current: 'a',
        paragraph: { body: [{ file: 'a', direct: 1, inherited: 0 }] },
        character: {},
        table: {},
      },
    },
  ])('refuses %j', (value) => {
    expect(parseHostMessage(value)).toBeUndefined();
  });

  it('takes the messages of the protocol', () => {
    const init = {
      type: 'init',
      documentText: 'a',
      stylesheetText: 'b',
      defaults: { classification: 'Internal', authors: ['A'], pageTemplate: 'page-letter' },
      usedIds: ['x'],
    };
    expect(parseHostMessage(init)).toEqual(init);
    expect(parseHostMessage({ type: 'defaults', defaults: {} })).toEqual({
      type: 'defaults',
      defaults: {},
    });
    expect(parseHostMessage({ type: 'external-text', text: 'a' })).toEqual({
      type: 'external-text',
      text: 'a',
    });
    expect(parseHostMessage({ type: 'stylesheet', text: 'a' })).toEqual({
      type: 'stylesheet',
      text: 'a',
    });
    expect(parseHostMessage({ type: 'used-ids', ids: [] })).toEqual({ type: 'used-ids', ids: [] });
    expect(parseHostMessage({ type: 'declared', ok: false, message: 'No.' })).toEqual({
      type: 'declared',
      ok: false,
      message: 'No.',
    });
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
    { type: 'init', documentText: 'a', stylesheetText: 'b', defaults: {}, usedIds: [1] },
    { type: 'init', documentText: 'a', defaults: {}, usedIds: [] },
    { type: 'init', documentText: 'a', stylesheetText: 'b', usedIds: [] },
    { type: 'defaults' },
    { type: 'defaults', defaults: { classification: 5 } },
    { type: 'defaults', defaults: { authors: 'A' } },
    { type: 'external-text' },
    { type: 'used-ids', ids: 'x' },
    { type: 'declared', ok: 'yes', message: '' },
    { type: 'declared', ok: true },
    { type: 'refused', title: 'T', reasons: [{ line: 1 }], canFormat: true },
    { type: 'refused', title: 'T', reasons: [], canFormat: 'yes' },
    { type: 'other' },
  ])('refuses %j', (value) => {
    expect(parseHostMessage(value)).toBeUndefined();
  });
});

describe('edit-styles', () => {
  it('takes a request with a style, and one without', () => {
    expect(parseWebviewMessage({ type: 'edit-styles' })).toEqual({ type: 'edit-styles' });
    expect(
      parseWebviewMessage({
        type: 'edit-styles',
        style: { kind: 'table-style', name: 'table' },
      }),
    ).toEqual({ type: 'edit-styles', style: { kind: 'table-style', name: 'table' } });
  });

  it.each([
    { type: 'edit-styles', style: 'table' },
    { type: 'edit-styles', style: { kind: 'color', name: 'brand' } },
    { type: 'edit-styles', style: { kind: 'table-style' } },
    { type: 'edit-styles', style: { kind: 'table-style', name: '' } },
    { type: 'edit-styles', style: { kind: 'table-style', name: 'x'.repeat(201) } },
  ])('refuses %j', (value) => {
    expect(parseWebviewMessage(value)).toBeUndefined();
  });
});
