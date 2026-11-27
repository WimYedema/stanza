import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH, parseHostMessage, parseWebviewMessage } from './protocol.js';

describe('parseWebviewMessage', () => {
  it('checks both source snapshots for guarded metadata edits', () => {
    const change = { type: 'metadata-change', before: 'old', text: 'new' };
    expect(parseWebviewMessage(change)).toEqual(change);
    expect(parseWebviewMessage({ ...change, before: 4 })).toBeUndefined();
    expect(parseWebviewMessage({ ...change, text: null })).toBeUndefined();
    expect(
      parseWebviewMessage({ ...change, before: 'x'.repeat(MAX_TEXT_LENGTH + 1) }),
    ).toBeUndefined();
    expect(parseWebviewMessage({ type: 'open-project' })).toEqual({ type: 'open-project' });
  });
  it('takes action timings only with a list of durations for every measured action', () => {
    const timings = { type: [1, 2.5], enter: [3], style: [], strong: [0] };
    const applied = { type: 2, enter: 1, style: 0, strong: 1 };
    expect(parseWebviewMessage({ type: 'action-timings', timings, applied })).toEqual({
      type: 'action-timings',
      timings,
      applied,
    });
    expect(
      parseWebviewMessage({ type: 'action-timings', timings, applied: { ...applied, type: -1 } }),
    ).toBeUndefined();
    for (const bad of [
      { ...timings, enter: undefined },
      { ...timings, type: [-1] },
      { ...timings, style: [Infinity] },
      { ...timings, strong: ['fast'] },
      [1, 2],
    ]) {
      expect(
        parseWebviewMessage({ type: 'action-timings', timings: bad, applied }),
      ).toBeUndefined();
    }
  });
  it('takes the painted stages of startup and nothing else', () => {
    const at = 1_795_000_000_000.5;
    const steps = [{ name: 'editor', ms: 71.2 }];
    expect(parseWebviewMessage({ type: 'painted', stage: 'visible', at, steps })).toEqual({
      type: 'painted',
      stage: 'visible',
      at,
      steps,
    });
    expect(parseWebviewMessage({ type: 'painted', stage: 'editable', at })).toEqual({
      type: 'painted',
      stage: 'editable',
      at,
    });
    for (const stage of ['done', 1, undefined]) {
      expect(parseWebviewMessage({ type: 'painted', stage, at })).toBeUndefined();
    }
    for (const bad of [undefined, -1, Infinity, 'now']) {
      expect(parseWebviewMessage({ type: 'painted', stage: 'visible', at: bad })).toBeUndefined();
    }
    for (const bad of [[{ name: 'editor', ms: -1 }], [{ name: 3, ms: 1 }], 'steps']) {
      expect(
        parseWebviewMessage({ type: 'painted', stage: 'visible', at, steps: bad }),
      ).toBeUndefined();
    }
  });
  it('takes the messages of the protocol', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'format', extra: 1 })).toEqual({ type: 'format' });
    expect(parseWebviewMessage({ type: 'open-as-text' })).toEqual({ type: 'open-as-text' });
    expect(parseWebviewMessage({ type: 'follow-reference', target: 'a1b2c3d4e5' })).toEqual({
      type: 'follow-reference',
      target: 'a1b2c3d4e5',
    });
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
    { type: 'follow-reference', target: '' },
    { type: 'follow-reference', target: 5 },
    { type: 'declare-variant', style: 'body' },
    { type: 'declare-variant', style: 5, mark: 'strong' },
    { type: 'declare-variant', style: 'x'.repeat(201), mark: 'strong' },
  ])('refuses %j', (value) => {
    expect(parseWebviewMessage(value)).toBeUndefined();
  });
});

describe('parseHostMessage', () => {
  it('asks for a whole, bounded number of measured runs', () => {
    expect(parseHostMessage({ type: 'measure-actions', runs: 20 })).toEqual({
      type: 'measure-actions',
      runs: 20,
    });
    for (const runs of [0, -1, 2.5, 1001, '20']) {
      expect(parseHostMessage({ type: 'measure-actions', runs })).toBeUndefined();
    }
  });
  it('validates scheme settings on startup and configuration refresh', () => {
    const schemes = { jira: 'https://example.org/{id}' };
    const init = {
      type: 'init',
      documentText: '',
      stylesheetText: '',
      defaults: {},
      usedIds: [],
      projectReady: true,
      linkSchemes: schemes,
    };
    expect(parseHostMessage(init)).toEqual(init);
    expect(parseHostMessage({ type: 'link-schemes', schemes })).toEqual({
      type: 'link-schemes',
      schemes,
    });
    for (const bad of [null, [], { jira: 42 }]) {
      expect(parseHostMessage({ ...init, linkSchemes: bad })).toBeUndefined();
      expect(parseHostMessage({ type: 'link-schemes', schemes: bad })).toBeUndefined();
    }
  });

  it('distinguishes no declarations from an empty declaration and validates metadata messages', () => {
    const fields = [{ name: 'doc-no', type: 'string', required: true, label: 'Number' }];
    expect(parseHostMessage({ type: 'metadata-fields' })).toEqual({ type: 'metadata-fields' });
    expect(parseHostMessage({ type: 'metadata-fields', fields: [] })).toEqual({
      type: 'metadata-fields',
      fields: [],
    });
    expect(parseHostMessage({ type: 'metadata-fields', fields })).toEqual({
      type: 'metadata-fields',
      fields,
    });
    const init = {
      type: 'init',
      documentText: '',
      stylesheetText: '',
      defaults: {},
      usedIds: [],
      projectReady: true,
    };
    expect(parseHostMessage({ ...init, fields })).toEqual({ ...init, fields });
    for (const bad of [
      null,
      {},
      [{ name: 'Bad name', type: 'string', required: false }],
      [{ name: 'x', type: 'number', required: false }],
      [{ name: 'x', type: 'list', required: 'yes' }],
      [...fields, ...fields],
    ]) {
      expect(parseHostMessage({ type: 'metadata-fields', fields: bad })).toBeUndefined();
      expect(parseHostMessage({ ...init, fields: bad })).toBeUndefined();
    }
    const result = { type: 'metadata-result', ok: false, message: 'Stale', text: 'source' };
    expect(parseHostMessage(result)).toEqual(result);
    expect(parseHostMessage({ ...result, ok: 'yes' })).toBeUndefined();
    expect(parseHostMessage({ ...result, text: undefined })).toBeUndefined();
  });
  it('requires explicit preview readiness and a checked list of IDs before enabling editing', () => {
    const init = { type: 'init', documentText: '', stylesheetText: '', defaults: {}, usedIds: [] };
    expect(parseHostMessage(init)).toBeUndefined();
    expect(parseHostMessage({ ...init, projectReady: false })).toEqual({
      ...init,
      projectReady: false,
    });
    expect(parseHostMessage({ type: 'project-ready', usedIds: [4] })).toBeUndefined();
    expect(parseHostMessage({ type: 'project-ready', usedIds: ['aaaaaaaaaa'] })).toEqual({
      type: 'project-ready',
      usedIds: ['aaaaaaaaaa'],
    });
  });
  it('takes the usage of the styles', () => {
    const usage = {
      type: 'usage',
      usage: {
        current: 'documents/a.stanza.md',
        paragraph: {
          body: [{ file: 'documents/a.stanza.md', direct: 0, default: 4, inherited: 1 }],
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
      projectReady: true,
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
    const images = {
      'assets/logo.png': 'data:image/png;base64,iVBORw0KGgo=',
      'assets/mark.jpg': 'data:image/jpeg;base64,/9j/4AAQ',
    };
    expect(parseHostMessage({ type: 'images', images })).toEqual({ type: 'images', images });
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
    { type: 'images' },
    { type: 'images', images: { 'a.png': 5 } },
    { type: 'images', images: { 'a.svg': 'data:image/svg+xml;base64,PHN2Zy8+' } },
    { type: 'images', images: { 'a.png': 'https://example.com/a.png' } },
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

describe('the make-reference message', () => {
  it('has no content', () => {
    expect(parseHostMessage({ type: 'make-reference' })).toEqual({ type: 'make-reference' });
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

describe('the messages of review threads (ADR 0086)', () => {
  it('takes an open or a resolve of a thread by its key, and nothing else', () => {
    expect(parseWebviewMessage({ type: 'open-review', key: 'r#a' })).toEqual({
      type: 'open-review',
      key: 'r#a',
    });
    expect(
      parseWebviewMessage({ type: 'set-thread-status', key: 'r#a', status: 'resolved' }),
    ).toEqual({ type: 'set-thread-status', key: 'r#a', status: 'resolved' });
    expect(parseWebviewMessage({ type: 'set-thread-status', key: 'r#a', status: 'gone' })).toBe(
      undefined,
    );
    expect(parseWebviewMessage({ type: 'open-review', key: '' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'open-review', key: 'x'.repeat(5000) })).toBeUndefined();
  });

  it('takes the review round both ways (ADR 0088)', () => {
    expect(parseWebviewMessage({ type: 'review-push', mode: 'new' })).toEqual({
      type: 'review-push',
      mode: 'new',
    });
    expect(parseWebviewMessage({ type: 'review-push', mode: 'elsewhere' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'review-pull' })).toEqual({ type: 'review-pull' });
    expect(parseWebviewMessage({ type: 'open-review-folder' })).toEqual({
      type: 'open-review-folder',
    });
    const round = {
      type: 'review-round',
      status: { kind: 'unpulled', comments: 3, savedAt: '2026-11-24 17:37' },
      folder: 'Review',
    };
    expect(parseHostMessage(round)).toEqual(round);
    expect(parseHostMessage({ type: 'review-round', status: { kind: 'current' } })).toEqual({
      type: 'review-round',
      status: { kind: 'current' },
    });
    expect(
      parseHostMessage({ type: 'review-round', status: { kind: 'unpulled', comments: -1 } }),
    ).toBeUndefined();
    expect(parseHostMessage({ type: 'review-round', status: { kind: 'gone' } })).toBeUndefined();
    expect(parseHostMessage({ type: 'review-done' })).toEqual({ type: 'review-done' });
  });

  it('takes the end of a resolve from the host', () => {
    expect(parseHostMessage({ type: 'thread-status-done', key: 'r#a' })).toEqual({
      type: 'thread-status-done',
      key: 'r#a',
    });
    expect(parseHostMessage({ type: 'thread-status-done' })).toBeUndefined();
  });
});
