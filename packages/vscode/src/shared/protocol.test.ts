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

describe('the reveal message', () => {
  it('takes the mark flag of an outside change, and refuses one that is not true or false', () => {
    expect(parseHostMessage({ type: 'external-text', text: 'a', mark: false })).toEqual({
      type: 'external-text',
      text: 'a',
      mark: false,
    });
    expect(parseHostMessage({ type: 'external-text', text: 'a', mark: 'no' })).toBeUndefined();
    expect(parseHostMessage({ type: 'external-text', mark: false })).toBeUndefined();
  });

  it('takes a block number, and nothing else', () => {
    expect(parseHostMessage({ type: 'reveal', block: 3 })).toEqual({ type: 'reveal', block: 3 });
    for (const block of [-1, 1.5, '2', undefined, Number.NaN]) {
      expect(parseHostMessage({ type: 'reveal', block })).toBeUndefined();
    }
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

describe('the diagnostics message', () => {
  it('takes the diagnostics of a document, with or without a path and an ID', () => {
    const message = {
      type: 'diagnostics',
      diagnostics: [
        { severity: 'warning', code: 'missing-id', message: 'No ID.', path: 'blocks[0]' },
        { severity: 'error', code: 'unknown-style', message: 'No style.', nodeId: 'k7m2q9x4zb' },
        { severity: 'error', code: 'x', message: 'Y.' },
      ],
    };
    expect(parseHostMessage(message)).toEqual(message);
    expect(parseHostMessage({ type: 'diagnostics', diagnostics: [] })).toEqual({
      type: 'diagnostics',
      diagnostics: [],
    });
  });

  it.each([
    { type: 'diagnostics' },
    { type: 'diagnostics', diagnostics: 'x' },
    { type: 'diagnostics', diagnostics: [{ severity: 'info', code: 'a', message: 'b' }] },
    { type: 'diagnostics', diagnostics: [{ severity: 'error', code: 1, message: 'b' }] },
    { type: 'diagnostics', diagnostics: [{ severity: 'error', code: 'a', message: 'b', path: 5 }] },
    {
      type: 'diagnostics',
      diagnostics: [{ severity: 'error', code: 'a', message: 'b', nodeId: 5 }],
    },
    { type: 'diagnostics', diagnostics: [null] },
  ])('refuses %j', (value) => {
    expect(parseHostMessage(value)).toBeUndefined();
  });
});
