import { getSchema } from '@tiptap/core';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import type { StyleName } from '@phrase/core';
import {
  checkCommand,
  isAllowedHref,
  runCommand,
  type CommandResult,
  type EditorCommand,
} from './commands.js';
import { editorContext } from './context.js';
import { schemaExtensions } from './schema.js';
import { COMMANDS_STYLESHEET } from './styles.testing.js';

const schema = getSchema(schemaExtensions());

const parsed = COMMANDS_STYLESHEET;
const stylesheet = parsed.stylesheet;

const text = (value: string, marks: string[] = []) => ({
  type: 'text',
  text: value,
  marks: marks.map((type) => ({ type })),
});
const paragraph = (value: string, attrs: object = {}, marks: string[] = []) => ({
  type: 'paragraph',
  attrs,
  content: value === '' ? [] : [text(value, marks)],
});
const heading = (value: string, level = 1, attrs: object = {}) => ({
  type: 'heading',
  attrs: { level, ...attrs },
  content: [text(value)],
});
const item = (...blocks: object[]) => ({ type: 'listItem', content: blocks });
const bullets = (...items: object[]) => ({ type: 'bulletList', content: items });
const cell = (type: 'tableHeader' | 'tableCell', value: string, marks: string[] = []) => ({
  type,
  content: [{ type: 'paragraph', content: value === '' ? [] : [text(value, marks)] }],
});
const row = (...cells: object[]) => ({ type: 'tableRow', content: cells });

const build = (...blocks: object[]): EditorNode =>
  schema.nodeFromJSON({ type: 'doc', content: blocks });

function posOf(doc: EditorNode, value: string, offset = 0): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value) === true) {
      found = pos + (node.text.indexOf(value) + offset);
    }
  });
  if (found < 0) throw new Error(`No text "${value}".`);
  return found;
}

/** A state with the selection over a piece of text, or a cursor in it. */
function select(doc: EditorNode, value: string, length = 0): EditorState {
  const from = posOf(doc, value);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, from, from + length),
  });
}

function run(
  state: EditorState,
  command: EditorCommand,
): { result: CommandResult; next: EditorState; changed: boolean } {
  const transactions: Transaction[] = [];
  const result = runCommand(state, (tr) => transactions.push(tr), command, stylesheet);
  let next = state;
  for (const tr of transactions) next = next.apply(tr);
  return { result, next, changed: transactions.length > 0 };
}

const refusal = (outcome: { result: CommandResult }): string =>
  outcome.result.ok ? 'ok' : outcome.result.reason;
const names = (node: EditorNode): string[] => {
  const found: string[] = [];
  node.descendants((child) => {
    found.push(child.type.name);
  });
  return found;
};
const marksOf = (node: EditorNode, value: string): string[] => {
  let found: string[] = [];
  node.descendants((child) => {
    if (child.isText && child.text?.includes(value) === true) {
      found = child.marks.map((mark) => mark.type.name);
    }
  });
  return found;
};

describe('the stylesheet of the tests', () => {
  it('is valid', () => {
    expect(parsed.diagnostics).toEqual([]);
  });
});

describe('isAllowedHref', () => {
  it.each(['https://example.org', 'http://a.b/c?d=e', 'mailto:a@b.c', '#k7m2q9x4zb'])(
    'allows %s',
    (href) => {
      expect(isAllowedHref(href)).toBe(true);
    },
  );
  it.each([
    '',
    '#',
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///etc',
    'a b',
    'https://a b',
  ])('refuses "%s"', (href) => {
    expect(isAllowedHref(href)).toBe(false);
  });
});

describe('marks', () => {
  it('adds a mark to the selection, and takes it off again', () => {
    const state = select(build(paragraph('Some text here')), 'text', 4);
    const on = run(state, { type: 'toggle-mark', mark: 'strong' });
    expect(on.result).toEqual({ ok: true });
    expect(marksOf(on.next.doc, 'text')).toEqual(['strong']);
    const off = run(
      EditorState.create({ schema, doc: on.next.doc, selection: on.next.selection }),
      { type: 'toggle-mark', mark: 'strong' },
    );
    expect(marksOf(off.next.doc, 'text')).toEqual([]);
  });

  it('remembers a mark at a cursor for the next typing', () => {
    const outcome = run(select(build(paragraph('Some text')), 'text'), {
      type: 'toggle-mark',
      mark: 'emphasis',
    });
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.next.storedMarks?.map((mark) => mark.type.name)).toEqual(['emphasis']);
  });

  it('refuses a mark that the style does not allow, and changes nothing', () => {
    const doc = build(paragraph('Some text', { style: 'plain' }));
    const outcome = run(select(doc, 'text', 4), { type: 'toggle-mark', mark: 'strong' });
    expect(outcome.result).toEqual({
      ok: false,
      reason: 'mark-not-allowed',
      message: 'The style "plain" does not allow strong.',
      fix: { kind: 'declare-variant', style: 'plain', mark: 'strong' },
    });
    expect(outcome.next.doc.toJSON()).toEqual(doc.toJSON());
  });

  it('offers the fix for a mark at a cursor and for a link', () => {
    const cursor = run(select(build(paragraph('Some text', { style: 'plain' })), 'text'), {
      type: 'toggle-mark',
      mark: 'emphasis',
    });
    expect(cursor.result).toMatchObject({
      fix: { kind: 'declare-variant', style: 'plain', mark: 'emphasis' },
    });
    const link = run(select(build(paragraph('Some text', { style: 'plain' })), 'text', 4), {
      type: 'set-link',
      href: 'https://example.com',
    });
    expect(link.result).toMatchObject({
      fix: { kind: 'declare-variant', style: 'plain', mark: 'link' },
    });
  });

  it('offers no fix where a style is not the cause', () => {
    const refused = run(select(build({ type: 'codeBlock', content: [text('x = 1')] }), 'x', 1), {
      type: 'toggle-mark',
      mark: 'strong',
    });
    expect(refused.result).toMatchObject({ ok: false, reason: 'mark-not-allowed' });
    expect(refused.result).not.toHaveProperty('fix');
  });

  it('checks a command with no change, and gives the same answer as run', () => {
    const doc = build(paragraph('Some text', { style: 'plain' }));
    const state = select(doc, 'text', 4);
    const command: EditorCommand = { type: 'toggle-mark', mark: 'strong' };
    expect(checkCommand(state, command, stylesheet)).toEqual(run(state, command).result);
    expect(
      checkCommand(state, { type: 'toggle-mark', mark: 'emphasis' }, stylesheet),
    ).toMatchObject({ ok: false });
    const allowed = build(paragraph('Some text'));
    expect(
      checkCommand(select(allowed, 'text', 4), { type: 'toggle-mark', mark: 'strong' }, stylesheet),
    ).toEqual({ ok: true });
  });

  it('refuses a mark at a cursor in a style that does not allow it', () => {
    const outcome = run(select(build(paragraph('Some text', { style: 'plain' })), 'text'), {
      type: 'toggle-mark',
      mark: 'strong',
    });
    expect(refusal(outcome)).toBe('mark-not-allowed');
    expect(outcome.next.storedMarks).toBeNull();
  });

  it('refuses the whole selection when one block of it does not allow the mark', () => {
    const doc = build(paragraph('First one'), paragraph('Second one', { style: 'plain' }));
    const from = posOf(doc, 'one');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, from, posOf(doc, 'Second') + 6),
    });
    const outcome = run(state, { type: 'toggle-mark', mark: 'strong' });
    expect(refusal(outcome)).toBe('mark-not-allowed');
    expect(marksOf(outcome.next.doc, 'one')).toEqual([]);
  });

  it('always lets a mark be taken off, also where the style does not allow it', () => {
    const doc = build(paragraph('Some text', { style: 'plain' }, ['strong']));
    const outcome = run(select(doc, 'Some text', 9), { type: 'toggle-mark', mark: 'strong' });
    expect(outcome.result).toEqual({ ok: true });
    expect(marksOf(outcome.next.doc, 'Some')).toEqual([]);
  });

  it('refuses marks in a code block', () => {
    const doc = build({ type: 'codeBlock', content: [{ type: 'text', text: 'let x;' }] });
    const outcome = run(select(doc, 'let', 3), { type: 'toggle-mark', mark: 'code' });
    expect(outcome.result).toEqual({
      ok: false,
      reason: 'mark-not-allowed',
      message: 'Code blocks take no marks.',
    });
  });

  it('uses the cell style of a table for the text in its cells', () => {
    const table = (style: string) => ({
      type: 'table',
      attrs: { style },
      content: [row(cell('tableHeader', 'Head')), row(cell('tableCell', 'Body'))],
    });
    const allowed = run(select(build(table('table')), 'Body', 4), {
      type: 'toggle-mark',
      mark: 'strong',
    });
    expect(allowed.result).toEqual({ ok: true });
    const refused = run(select(build(table('table-plain')), 'Body', 4), {
      type: 'toggle-mark',
      mark: 'strong',
    });
    expect(refusal(refused)).toBe('mark-not-allowed');
  });

  it('adds a link only for an allowed target, and takes a whole link off from a cursor', () => {
    const doc = build(paragraph('Some linked text'));
    const bad = run(select(doc, 'linked', 6), { type: 'set-link', href: 'javascript:alert(1)' });
    expect(refusal(bad)).toBe('invalid-argument');
    expect(refusal(run(select(doc, 'linked'), { type: 'set-link', href: 'https://a.b' }))).toBe(
      'not-applicable',
    );
    const good = run(select(doc, 'linked', 6), { type: 'set-link', href: ' https://example.org ' });
    expect(good.result).toEqual({ ok: true });
    const link = good.next.doc.firstChild?.child(1).marks[0];
    expect(link?.attrs).toEqual({ href: 'https://example.org' });
    const cursor = EditorState.create({
      schema,
      doc: good.next.doc,
      selection: TextSelection.create(good.next.doc, posOf(good.next.doc, 'linked', 2)),
    });
    const removed = run(cursor, { type: 'remove-link' });
    expect(removed.result).toEqual({ ok: true });
    expect(removed.next.doc.firstChild?.childCount).toBe(1);
  });

  it('refuses a link in a style that does not allow links, and a link in nothing', () => {
    const doc = build(paragraph('Some text', { style: 'plain' }));
    expect(refusal(run(select(doc, 'text', 4), { type: 'set-link', href: 'https://a.b' }))).toBe(
      'mark-not-allowed',
    );
    expect(refusal(run(select(doc, 'text', 4), { type: 'remove-link' }))).toBe('not-applicable');
  });

  describe('a reference to a block', () => {
    const id = 'k7m2q9x4zb';
    const linkOf = (state: EditorState, value: string) => {
      let found: Record<string, unknown> | undefined;
      state.doc.descendants((node) => {
        if (node.isText && node.text?.includes(value) === true) {
          found = node.marks.find((mark) => mark.type.name === 'link')?.attrs;
        }
      });
      return found;
    };

    it('makes the selected text a link to the block and keeps the text', () => {
      const doc = build(paragraph('See I5 for this'));
      const made = run(select(doc, 'I5', 2), { type: 'set-reference', id, text: 'ignored' });
      expect(made.result).toEqual({ ok: true });
      expect(made.next.doc.textContent).toBe('See I5 for this');
      expect(linkOf(made.next, 'I5')).toEqual({ href: `#${id}` });
    });

    it('inserts the text as the link when nothing is selected', () => {
      const doc = build(paragraph('See  for this'));
      const made = run(select(doc, ' for', 0), { type: 'set-reference', id, text: 'I5' });
      expect(made.result).toEqual({ ok: true });
      expect(made.next.doc.textContent).toBe('See I5 for this');
      expect(linkOf(made.next, 'I5')).toEqual({ href: `#${id}` });
      expect(linkOf(made.next, 'for this')).toBeUndefined();
    });

    it('replaces the text just before the cursor, such as the @ that opened the list, in one step', () => {
      const doc = build(paragraph('See @ for this'));
      const command: EditorCommand = { type: 'set-reference', id, text: 'I5', replaces: '@' };
      const state = select(doc, ' for', 0);
      let steps = 0;
      const made = runCommand(state, () => (steps += 1), command, stylesheet);
      expect(made).toEqual({ ok: true });
      expect(steps).toBe(1);
      const result = run(state, command);
      expect(result.next.doc.textContent).toBe('See I5 for this');
      expect(linkOf(result.next, 'I5')).toEqual({ href: `#${id}` });
    });

    it('leaves the text alone when it is not what is before the cursor', () => {
      const doc = build(paragraph('See x for this'));
      const made = run(select(doc, ' for', 0), {
        type: 'set-reference',
        id,
        text: 'I5',
        replaces: '@',
      });
      expect(made.next.doc.textContent).toBe('See xI5 for this');
    });

    it('works in a table cell and in a heading', () => {
      const doc = build(heading('A title', 2), {
        type: 'table',
        content: [row(cell('tableHeader', 'H')), row(cell('tableCell', 'see T6'))],
      });
      const inCell = run(select(doc, 'T6', 2), { type: 'set-reference', id, text: 'T6' });
      expect(inCell.result).toEqual({ ok: true });
      expect(linkOf(inCell.next, 'T6')).toEqual({ href: `#${id}` });
    });

    it('refuses what is not the ID of a block, an empty text, and a code block', () => {
      const doc = build(paragraph('Some text'));
      const refusedFor = (command: EditorCommand, state = select(doc, 'text', 0)): string =>
        refusal(run(state, command));
      expect(refusedFor({ type: 'set-reference', id: 'my-title', text: 'x' })).toBe(
        'invalid-argument',
      );
      expect(refusedFor({ type: 'set-reference', id, text: '  ' })).toBe('invalid-argument');
      expect(refusedFor({ type: 'set-reference', id, text: 'a\nb' })).toBe('invalid-argument');
      const code = build({
        type: 'codeBlock',
        attrs: {},
        content: [text('const a = 1;')],
      });
      expect(refusedFor({ type: 'set-reference', id, text: 'x' }, select(code, 'const', 0))).toBe(
        'mark-not-allowed',
      );
    });

    it('is refused, with the fix, in a style that does not allow links', () => {
      const doc = build(paragraph('Some text', { style: 'plain' }));
      const refused = run(select(doc, 'text', 4), { type: 'set-reference', id, text: 'x' });
      expect(refusal(refused)).toBe('mark-not-allowed');
      const empty = run(select(doc, 'text', 0), { type: 'set-reference', id, text: 'x' });
      expect(refusal(empty)).toBe('mark-not-allowed');
      expect(refused.result.ok ? undefined : refused.result.fix).toEqual({
        kind: 'declare-variant',
        style: 'plain',
        mark: 'link',
      });
    });
  });

  it('applies a character style that exists, in every paragraph style', () => {
    const doc = build(paragraph('Some text', { style: 'plain' }));
    const marker = 'marker' as StyleName;
    const on = run(select(doc, 'text', 4), { type: 'toggle-character-style', style: marker });
    expect(on.result).toEqual({ ok: true });
    expect(marksOf(on.next.doc, 'text')).toEqual(['style']);
    const unknown = run(select(doc, 'text', 4), {
      type: 'toggle-character-style',
      style: 'nope' as StyleName,
    });
    expect(refusal(unknown)).toBe('unknown-style');
  });
});

describe('headings and styles', () => {
  it('turns a paragraph into a heading with the default style, and keeps its ID', () => {
    const doc = build(paragraph('Title', { id: 'k7m2q9x4zb', style: 'note' }));
    const outcome = run(select(doc, 'Title'), { type: 'set-heading', level: 1 });
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.next.doc.firstChild?.attrs).toEqual({ id: 'k7m2q9x4zb', level: 1, style: null });
    expect(outcome.next.doc.firstChild?.type.name).toBe('heading');
    const back = run(
      EditorState.create({
        schema,
        doc: outcome.next.doc,
        selection: TextSelection.create(outcome.next.doc, 2),
      }),
      { type: 'set-paragraph' },
    );
    expect(back.next.doc.firstChild?.type.name).toBe('paragraph');
    expect(back.next.doc.firstChild?.attrs['id']).toBe('k7m2q9x4zb');
  });

  it('refuses a heading where the text has marks that its style does not allow', () => {
    const doc = build(heading('Top', 5), paragraph('Some text', {}, ['strong']));
    const ok = run(select(doc, 'Some'), { type: 'set-heading', level: 1 });
    expect(ok.result).toEqual({ ok: true });
    const refused = run(select(doc, 'Some'), { type: 'set-heading', level: 6 });
    expect(refused.result).toEqual({
      ok: false,
      reason: 'marks-not-allowed',
      message:
        'The text has marks that the style "heading-6" does not allow: strong. Remove them first.',
      fix: { kind: 'declare-variant', style: 'heading-6', mark: 'strong' },
    });
    expect(refused.next.doc.child(1).type.name).toBe('paragraph');
  });

  it('keeps the outline continuous: a heading is at most one level deeper than the one before', () => {
    const doc = build(heading('One'), paragraph('Two'));
    const skipped = run(select(doc, 'Two'), { type: 'set-heading', level: 3 });
    expect(skipped.result).toEqual({
      ok: false,
      reason: 'heading-level',
      message:
        'A heading here is at most level 2, one deeper than the heading before it (level 1).',
    });
    expect(skipped.changed).toBe(false);
    expect(run(select(doc, 'Two'), { type: 'set-heading', level: 2 }).result).toEqual({ ok: true });
    expect(checkCommand(select(doc, 'Two'), { type: 'set-heading', level: 3 }, stylesheet)).toEqual(
      skipped.result,
    );
  });

  it('starts at level 1', () => {
    const doc = build(paragraph('Only'));
    expect(run(select(doc, 'Only'), { type: 'set-heading', level: 2 }).result).toEqual({
      ok: false,
      reason: 'heading-level',
      message: 'The first heading of a document is level 1.',
    });
    expect(run(select(doc, 'Only'), { type: 'set-heading', level: 1 }).result).toEqual({
      ok: true,
    });
  });

  it('never refuses a heading for staying as deep as it is or for going up', () => {
    // The text came with a skipped level, which only a diagnostic reports.
    const doc = build(heading('One'), heading('Deep', 3));
    expect(run(select(doc, 'Deep'), { type: 'set-heading', level: 3 }).result).toEqual({
      ok: true,
    });
    expect(run(select(doc, 'Deep'), { type: 'set-heading', level: 1 }).result).toEqual({
      ok: true,
    });
    expect(refusal(run(select(doc, 'Deep'), { type: 'set-heading', level: 4 }))).toBe(
      'heading-level',
    );
  });

  it('makes the paragraph of the default style, like Normal in Word', () => {
    const doc = build(paragraph('Some text', { id: 'k7m2q9x4zb', style: 'note' }));
    const outcome = run(select(doc, 'Some'), { type: 'set-paragraph' });
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.next.doc.firstChild?.attrs).toEqual({ id: 'k7m2q9x4zb', style: null });
  });

  it('does not make a heading in a list item or a table cell', () => {
    const inList = build(bullets(item(paragraph('Item'))));
    expect(refusal(run(select(inList, 'Item'), { type: 'set-heading', level: 1 }))).toBe(
      'not-applicable',
    );
    const inCell = build({
      type: 'table',
      content: [row(cell('tableHeader', 'Head'))],
    });
    expect(refusal(run(select(inCell, 'Head'), { type: 'set-heading', level: 1 }))).toBe(
      'not-applicable',
    );
  });

  it('sets and clears the style of a block, and refuses an unknown one', () => {
    const doc = build(paragraph('Some text'));
    const set = run(select(doc, 'text'), { type: 'set-style', style: 'note' as StyleName });
    expect(set.next.doc.firstChild?.attrs['style']).toBe('note');
    const cleared = run(
      EditorState.create({ schema, doc: set.next.doc, selection: set.next.selection }),
      { type: 'set-style', style: null },
    );
    expect(cleared.next.doc.firstChild?.attrs['style']).toBeNull();
    expect(
      refusal(run(select(doc, 'text'), { type: 'set-style', style: 'nope' as StyleName })),
    ).toBe('unknown-style');
    expect(
      refusal(run(select(doc, 'text'), { type: 'set-style', style: 'Not A Name' as StyleName })),
    ).toBe('invalid-argument');
  });

  it('does not change to a style that cannot carry the marks of the text', () => {
    const doc = build(paragraph('Some text', {}, ['strong']));
    const outcome = run(select(doc, 'text'), { type: 'set-style', style: 'plain' as StyleName });
    expect(refusal(outcome)).toBe('marks-not-allowed');
    expect(outcome.next.doc.firstChild?.attrs['style']).toBeNull();
  });

  it('sets the style of a table when the cursor is in a cell', () => {
    const doc = build({
      type: 'table',
      content: [row(cell('tableHeader', 'Head')), row(cell('tableCell', 'Body', ['strong']))],
    });
    const plain = run(select(doc, 'Head'), {
      type: 'set-style',
      style: 'table-plain' as StyleName,
    });
    // The cells of that table take the style `plain`, which does not allow strong.
    expect(refusal(plain)).toBe('marks-not-allowed');
    const fine = run(select(doc, 'Head'), { type: 'set-style', style: 'table' as StyleName });
    expect(fine.next.doc.firstChild?.attrs['style']).toBe('table');
    const wrong = run(select(doc, 'Head'), { type: 'set-style', style: 'note' as StyleName });
    expect(wrong.result).toMatchObject({ reason: 'unknown-style' });
  });
});

describe('table cells with paragraphs and lists', () => {
  const inCell = (...blocks: object[]) =>
    build({
      type: 'table',
      attrs: { style: 'table' },
      content: [
        row(cell('tableHeader', 'Head')),
        { type: 'tableRow', content: [{ type: 'tableCell', content: blocks }] },
      ],
    });
  const numbered = (value: string) => ({
    type: 'orderedList',
    content: [{ type: 'listItem', content: [paragraph(value)] }],
  });

  it('makes a list in a cell and takes it out again', () => {
    const on = run(select(inCell(paragraph('Body')), 'Body'), {
      type: 'toggle-list',
      kind: 'bulleted',
    });
    expect(on.result).toEqual({ ok: true });
    expect(names(on.next.doc)).toContain('bulletList');
    const off = run(on.next, { type: 'toggle-list', kind: 'bulleted' });
    expect(off.result).toEqual({ ok: true });
    expect(names(off.next.doc)).not.toContain('bulletList');
  });

  it('checks the marks of a paragraph of a cell against the cell style, and of a list item against its list', () => {
    const doc = inCell(paragraph('Body'), numbered('Item'));
    const strong = { type: 'toggle-mark', mark: 'strong' } as const;
    expect(run(select(doc, 'Body', 4), strong).result).toEqual({ ok: true });
    // The numbered list style offers no marks.
    expect(refusal(run(select(doc, 'Item', 4), strong))).toBe('mark-not-allowed');
  });

  it('sets the table style from any paragraph of a cell, and gives a list in a cell no style', () => {
    const doc = inCell(paragraph('Body'), numbered('Item'));
    const set = run(select(doc, 'Body'), { type: 'set-style', style: 'table-plain' as StyleName });
    expect(set.next.doc.firstChild?.attrs['style']).toBe('table-plain');
    const list = run(select(doc, 'Item'), { type: 'set-style', style: 'note' as StyleName });
    expect(refusal(list)).toBe('not-applicable');
    expect(list.changed).toBe(false);
  });

  it('tells a paragraph of a cell from a paragraph of a list in the cell', () => {
    const doc = inCell(paragraph('Body'), numbered('Item'));
    const plain = editorContext(select(doc, 'Body'), stylesheet);
    expect([plain.block, plain.inTable, plain.list]).toEqual(['table-cell', true, undefined]);
    expect(plain.style).toBe('table');
    const listed = editorContext(select(doc, 'Item'), stylesheet);
    expect([listed.block, listed.inTable, listed.list]).toEqual(['paragraph', true, 'numbered']);
    expect(editorContext(select(build(paragraph('x')), 'x'), stylesheet).inTable).toBe(false);
  });

  it('does not make a heading or a code block in a cell', () => {
    const doc = inCell(paragraph('Body'));
    expect(refusal(run(select(doc, 'Body'), { type: 'set-heading', level: 1 }))).toBe(
      'not-applicable',
    );
    expect(refusal(run(select(doc, 'Body'), { type: 'toggle-code-block' }))).toBe('not-applicable');
  });
});

describe('lists', () => {
  it('makes a list of a paragraph and takes it out again', () => {
    const doc = build(paragraph('One'), paragraph('Two'));
    const on = run(select(doc, 'One'), { type: 'toggle-list', kind: 'bulleted' });
    expect(on.result).toEqual({ ok: true });
    expect(names(on.next.doc)).toContain('bulletList');
    const off = run(on.next, { type: 'toggle-list', kind: 'bulleted' });
    expect(off.result).toEqual({ ok: true });
    expect(names(off.next.doc)).not.toContain('bulletList');
    expect(off.next.doc.childCount).toBe(2);
  });

  it('changes the kind of a list, unless the new style cannot carry the marks', () => {
    const plain = build(bullets(item(paragraph('One'))));
    const changed = run(select(plain, 'One'), { type: 'toggle-list', kind: 'numbered' });
    expect(changed.next.doc.firstChild?.type.name).toBe('orderedList');
    // `list-numbered` allows no marks in this stylesheet.
    const marked = build(bullets(item(paragraph('One', {}, ['strong']))));
    const refused = run(select(marked, 'One'), { type: 'toggle-list', kind: 'numbered' });
    expect(refusal(refused)).toBe('marks-not-allowed');
    expect(refused.next.doc.firstChild?.type.name).toBe('bulletList');
  });

  it('does not make a heading a list item', () => {
    expect(
      refusal(
        run(select(build(heading('Title')), 'Title'), { type: 'toggle-list', kind: 'bulleted' }),
      ),
    ).toBe('not-applicable');
  });

  it('nests an item under the one before it and lifts it out again', () => {
    const doc = build(bullets(item(paragraph('One')), item(paragraph('Two'))));
    const sunk = run(select(doc, 'Two'), { type: 'sink-list-item' });
    expect(sunk.result).toEqual({ ok: true });
    expect(names(sunk.next.doc).filter((name) => name === 'bulletList')).toHaveLength(2);
    const lifted = run(sunk.next, { type: 'lift-list-item' });
    expect(names(lifted.next.doc).filter((name) => name === 'bulletList')).toHaveLength(1);
    expect(refusal(run(select(doc, 'One'), { type: 'sink-list-item' }))).toBe('not-applicable');
    expect(
      refusal(run(select(build(paragraph('Plain')), 'Plain'), { type: 'lift-list-item' })),
    ).toBe('not-applicable');
  });
});

describe('code blocks and phrase blocks', () => {
  it('turns a paragraph into a code block with its language, and back', () => {
    const doc = build(paragraph('let x;', { id: 'k7m2q9x4zb' }));
    const on = run(select(doc, 'let'), { type: 'toggle-code-block', language: 'ts' });
    expect(on.next.doc.firstChild?.type.name).toBe('codeBlock');
    expect(on.next.doc.firstChild?.attrs).toMatchObject({ id: 'k7m2q9x4zb', language: 'ts' });
    const off = run(
      EditorState.create({
        schema,
        doc: on.next.doc,
        selection: TextSelection.create(on.next.doc, 2),
      }),
      { type: 'toggle-code-block' },
    );
    expect(off.next.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('refuses a paragraph that has marks, and a heading or a cell', () => {
    const marked = build(paragraph('let x;', {}, ['strong']));
    expect(refusal(run(select(marked, 'let'), { type: 'toggle-code-block' }))).toBe(
      'marks-not-allowed',
    );
    const title = build(heading('Title'));
    expect(refusal(run(select(title, 'Title'), { type: 'toggle-code-block' }))).toBe(
      'not-applicable',
    );
  });

  it('puts a phrase block after the block, or in place of an empty paragraph', () => {
    const after = run(select(build(paragraph('One'), paragraph('Two')), 'One'), {
      type: 'insert-phrase-block',
      kind: 'toc',
      text: 'depth: 2',
    });
    expect(after.next.doc.children.map((child) => child.type.name)).toEqual([
      'paragraph',
      'phraseBlock',
      'paragraph',
    ]);
    expect(after.next.doc.child(1).attrs).toMatchObject({ kind: 'toc', text: 'depth: 2' });
    const empty = build(paragraph('One'), paragraph(''));
    const state = EditorState.create({
      schema,
      doc: empty,
      selection: TextSelection.create(empty, empty.child(0).nodeSize + 1),
    });
    const replaced = run(state, { type: 'insert-phrase-block', kind: 'toc', text: '' });
    expect(replaced.next.doc.children.map((child) => child.type.name)).toEqual([
      'paragraph',
      'phraseBlock',
    ]);
  });

  it('refuses a kind that is not a name', () => {
    const outcome = run(select(build(paragraph('One')), 'One'), {
      type: 'insert-phrase-block',
      kind: 'Not A Kind',
      text: '',
    });
    expect(refusal(outcome)).toBe('invalid-argument');
  });
});

describe('tables', () => {
  const tableDoc = () =>
    build({
      type: 'table',
      content: [
        row(cell('tableHeader', 'A'), cell('tableHeader', 'B')),
        row(cell('tableCell', 'one'), cell('tableCell', 'two')),
      ],
    });
  const cells = (doc: EditorNode): string[][] =>
    (doc.firstChild?.children ?? []).map((tableRow) =>
      tableRow.children.map((child) => child.type.name),
    );

  it('inserts a table with a header row, and puts the cursor in its first cell', () => {
    const outcome = run(select(build(paragraph('One')), 'One'), {
      type: 'insert-table',
      columns: 3,
      rows: 2,
    });
    expect(outcome.result).toEqual({ ok: true });
    const table = outcome.next.doc.child(1);
    expect(table.type.name).toBe('table');
    expect(cells(outcome.next.doc.type.create(null, table))).toEqual([
      ['tableHeader', 'tableHeader', 'tableHeader'],
      ['tableCell', 'tableCell', 'tableCell'],
      ['tableCell', 'tableCell', 'tableCell'],
    ]);
    expect(
      outcome.next.selection.$from.node(outcome.next.selection.$from.depth - 1).type.name,
    ).toBe('tableHeader');
  });

  it.each([
    [0, 1],
    [21, 1],
    [1, 0],
    [1, 201],
    [1.5, 1],
  ])('refuses a table of %s columns and %s rows', (columns, rows) => {
    const outcome = run(select(build(paragraph('One')), 'One'), {
      type: 'insert-table',
      columns,
      rows,
    });
    expect(refusal(outcome)).toBe('invalid-argument');
  });

  it('adds a row below the header with body cells, and a column with a header cell', () => {
    const row = run(select(tableDoc(), 'A'), { type: 'add-row', where: 'after' });
    expect(row.result).toEqual({ ok: true });
    expect(cells(row.next.doc)).toEqual([
      ['tableHeader', 'tableHeader'],
      ['tableCell', 'tableCell'],
      ['tableCell', 'tableCell'],
    ]);
    const column = run(select(tableDoc(), 'A'), { type: 'add-column', where: 'after' });
    expect(cells(column.next.doc)).toEqual([
      ['tableHeader', 'tableHeader', 'tableHeader'],
      ['tableCell', 'tableCell', 'tableCell'],
    ]);
  });

  it('keeps the header row: nothing above it, and it cannot be deleted', () => {
    const above = run(select(tableDoc(), 'A'), { type: 'add-row', where: 'before' });
    expect(above.result).toMatchObject({ ok: false, reason: 'header-row' });
    const deleted = run(select(tableDoc(), 'A'), { type: 'delete-row' });
    expect(deleted.result).toMatchObject({ ok: false, reason: 'header-row' });
    expect(deleted.changed).toBe(false);
    const body = run(select(tableDoc(), 'one'), { type: 'add-row', where: 'before' });
    expect(body.result).toEqual({ ok: true });
  });

  it('deletes a body row and a column, and the table', () => {
    const noRow = run(select(tableDoc(), 'one'), { type: 'delete-row' });
    // The last body row can be deleted, which leaves the header row alone.
    expect(noRow.result).toEqual({ ok: true });
    expect(cells(noRow.next.doc)).toEqual([['tableHeader', 'tableHeader']]);
    const column = run(select(tableDoc(), 'B'), { type: 'delete-column' });
    expect(cells(column.next.doc)).toEqual([['tableHeader'], ['tableCell']]);
    const table = run(select(tableDoc(), 'A'), { type: 'delete-table' });
    expect(table.next.doc.childCount).toBeLessThanOrEqual(1);
    expect(names(table.next.doc)).not.toContain('table');
  });

  it('does nothing to a table outside a table', () => {
    for (const command of [
      { type: 'add-row', where: 'after' },
      { type: 'delete-column' },
      { type: 'delete-table' },
    ] as const) {
      expect(refusal(run(select(build(paragraph('One')), 'One'), command))).toBe('not-applicable');
    }
  });
});
