import { readFileSync } from 'node:fs';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@stanza/format';
import { toEditorContent } from './convert.js';
import {
  highlightThreads,
  highlightedThreads,
  placeThread,
  ReviewHighlights,
  type Placement,
  type ThreadPlace,
} from './review-threads.js';
import { schemaExtensions } from './schema.js';

const schema = getSchema(schemaExtensions());

/** The document that the review fixtures of item 203 were made from (ADR 0084). */
const SOURCE = readFileSync(
  new URL(
    '../../import-docx/fixtures/review-round-trip/0002-host-and-dependencies.stanza.md',
    import.meta.url,
  ),
  'utf8',
);
const docOf = (source: string) =>
  schema.nodeFromJSON(toEditorContent(parseDocument(source).document));
const doc = docOf(SOURCE);

const textOf = (placement: Placement): string =>
  placement.kind === 'range' ? doc.textBetween(placement.from, placement.to, ' ') : placement.kind;

/** The threads that `review pull` wrote for `web-replies-resolved-reaction.docx`. */
const thread = (place: Omit<ThreadPlace, 'key'>): ThreadPlace => ({ key: 'k', ...place });

describe('placeThread (ADR 0086)', () => {
  it('finds the quote on a heading', () => {
    expect(
      textOf(
        placeThread(
          doc,
          thread({
            anchor: '6jps6cyntz',
            quote: { start: 'ADR 0002: Host environment and dependency policy' },
          }),
        ),
      ),
    ).toBe('ADR 0002: Host environment and dependency policy');
  });

  it('finds a word in a list item under its heading, by the position among repeats', () => {
    // "host" occurs more than once under Host; the position says which.
    const placed = placeThread(
      doc,
      thread({
        anchor: 'vkpazyqv7x',
        position: { kind: 'under', paragraph: 4 },
        quote: { start: 'host' },
      }),
    );
    expect(textOf(placed)).toBe('host');
    if (placed.kind !== 'range') throw new Error('not placed');
    const block = doc.resolve(placed.from).parent.textContent;
    expect(block.startsWith('A browser host later')).toBe(true);
  });

  it('finds a cell of a table by row and column', () => {
    const placed = placeThread(
      doc,
      thread({
        anchor: 'x6gmjy7p23',
        position: { kind: 'cell', row: 2, column: 2 },
        quote: { start: 'Domain' },
      }),
    );
    expect(textOf(placed)).toBe('Domain');
  });

  it('finds a word in the paragraph after a table, not the same word in a cell', () => {
    const placed = placeThread(
      doc,
      thread({
        anchor: 'x6gmjy7p23',
        position: { kind: 'after', paragraph: 1 },
        quote: { start: 'Node' },
      }),
    );
    if (placed.kind !== 'range') throw new Error('not placed');
    expect(
      doc.resolve(placed.from).parent.textContent.startsWith('core, format, and export-docx'),
    ).toBe(true);
  });

  it('finds a long quote by its two ends, across paragraphs and headings', () => {
    const placed = placeThread(
      doc,
      thread({
        anchor: 'b2qjj8ze19',
        quote: {
          start: 'Context The product is local-first.',
          end: 'Decision Host Build in this order:',
        },
      }),
    );
    const text = textOf(placed);
    expect(text.startsWith('Context The product is local-first.')).toBe(true);
    expect(text.endsWith('Build in this order:')).toBe(true);
  });

  it('finds a quote that starts in the text without an ID just before its anchor', () => {
    // As in ADR 0084 itself: the comment starts in the status line, which has no bookmark, so it
    // is anchored on the next heading.
    const lead = docOf(
      [
        '---',
        'stanza-format: 1',
        'title: "Lead"',
        '---',
        '',
        '<!-- stanza: #aaaaaaaaaa -->',
        '# Title',
        '',
        'Status: Accepted. Builds on ADR 0009.',
        '',
        '<!-- stanza: #bbbbbbbbbb -->',
        '## Context',
        '',
        'Reviewers comment on a generated DOCX.',
        '',
        'Status: Accepted again, in the section.',
        '',
      ].join('\n'),
    );
    const at = (quote: ThreadPlace['quote']): string => {
      const placed = placeThread(
        lead,
        thread({ anchor: 'bbbbbbbbbb', ...(quote ? { quote } : {}) }),
      );
      return placed.kind === 'range' ? lead.textBetween(placed.from, placed.to, ' ') : placed.kind;
    };
    expect(at({ start: 'Status: Accepted. Builds on', end: 'comment on a generated DOCX' })).toBe(
      'Status: Accepted. Builds on ADR 0009. Context Reviewers comment on a generated DOCX',
    );
    // The section of the anchor comes first; the text before it only when the quote is not there.
    expect(at({ start: 'Status: Accepted' })).toBe('Status: Accepted');
    const inSection = placeThread(
      lead,
      thread({ anchor: 'bbbbbbbbbb', quote: { start: 'Status: Accepted' } }),
    );
    if (inSection.kind !== 'range') throw new Error('not placed');
    expect(lead.resolve(inSection.from).parent.textContent).toContain('again');
    // Not past the block with an ID before it.
    expect(at({ start: 'Title' })).toBe('block');
  });

  it('stays at its block when the text changed, and is orphaned without its block', () => {
    expect(
      placeThread(doc, thread({ anchor: 'vkpazyqv7x', quote: { start: 'words nobody wrote' } })),
    ).toMatchObject({ kind: 'block', changed: true });
    expect(placeThread(doc, thread({ anchor: 'vkpazyqv7x' }))).toMatchObject({
      kind: 'block',
      changed: false,
    });
    expect(placeThread(doc, thread({ anchor: 'zzzzzzzzzz', quote: { start: 'host' } }))).toEqual({
      kind: 'orphan',
    });
    expect(placeThread(doc, thread({ quote: { start: 'host' } }))).toEqual({ kind: 'orphan' });
  });
});

describe('ReviewHighlights', () => {
  it('keeps a highlight on its text while the text before it changes', () => {
    let state = EditorState.create({
      schema,
      doc: docOf('---\nstanza-format: 1\n---\n\nAlpha beta gamma.\n'),
      plugins: ReviewHighlights.config.addProseMirrorPlugins?.call({} as never) ?? [],
    });
    const from = 1 + 'Alpha '.length;
    state = state.apply(highlightThreads(state, [{ key: 'a', from, to: from + 4 }]));
    state = state.apply(state.tr.insertText('Very ', 1));
    const [range] = highlightedThreads(state);
    expect(range === undefined ? '' : state.doc.textBetween(range.from, range.to)).toBe('beta');
  });
});
