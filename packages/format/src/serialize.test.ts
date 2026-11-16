import {
  normalizeDocument,
  plainCell,
  type CellBlock,
  type Document,
  type Inline,
  type List,
  type Mark,
  type Paragraph,
  type StyleName,
  type TableCell,
} from '@phrase/core';
import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse.js';
import { serializeDocument } from './serialize.js';

const strong: Mark = { type: 'strong' };
const emphasis: Mark = { type: 'emphasis' };
const code: Mark = { type: 'code' };
const link: Mark = { type: 'link', href: 'https://example.com/a_b' };
const marker: Mark = { type: 'style', name: 'marker' as StyleName };

function run(text: string, ...marks: Mark[]): Inline {
  return { type: 'text', text, marks };
}

function documentOf(...blocks: Document['blocks']): Document {
  return { meta: { fields: {} }, blocks };
}

function paragraph(...content: Inline[]): Paragraph {
  return { type: 'paragraph', content };
}

/** Serializing and parsing again must give back the normalized document, without diagnostics. */
function expectRoundTrip(document: Document): void {
  const text = serializeDocument(document);
  const parsed = parseDocument(text);
  expect(parsed.diagnostics, text).toEqual([]);
  expect(parsed.document, text).toEqual(normalizeDocument(document));
  expect(serializeDocument(parsed.document), text).toBe(text);
}

describe('serializeDocument', () => {
  it('writes front matter and no blocks', () => {
    expect(serializeDocument(documentOf())).toBe('---\nphrase-format: 1\n---\n');
  });

  it('writes an empty heading without trailing whitespace', () => {
    expect(serializeDocument(documentOf({ type: 'heading', level: 2, content: [] }))).toBe(
      '---\nphrase-format: 1\n---\n\n##\n',
    );
  });

  it('drops empty paragraphs, which Markdown cannot express', () => {
    const text = serializeDocument(documentOf(paragraph(), paragraph(run('kept'))));
    expect(text).toBe('---\nphrase-format: 1\n---\n\nkept\n');
  });

  it('writes an empty list item as a bare marker', () => {
    const list: Document['blocks'][number] = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [] }, { blocks: [paragraph(run('x'))] }],
    };
    expect(serializeDocument(documentOf(list))).toBe('---\nphrase-format: 1\n---\n\n-\n- x\n');
    expectRoundTrip(documentOf(list));
  });

  it('writes metadata in canonical order with quoted strings', () => {
    const text = serializeDocument({
      meta: {
        title: 'T: "quoted"',
        authors: [],
        classification: 'restricted',
        fields: { zeta: 'z', alpha: ['a', 'b'] },
      },
      blocks: [],
    });
    expect(text).toBe(
      [
        '---',
        'phrase-format: 1',
        'title: "T: \\"quoted\\""',
        'authors: []',
        'classification: "restricted"',
        'alpha:',
        '  - "a"',
        '  - "b"',
        'zeta: "z"',
        '---',
        '',
      ].join('\n'),
    );
    expectRoundTrip({ ...parseDocument(text).document });
  });
});

describe('round trips', () => {
  it('keeps marks and their nesting', () => {
    expectRoundTrip(
      documentOf(
        paragraph(
          run('a '),
          run('b ', strong),
          run('c', strong, emphasis),
          run(' d', strong),
          run(' '),
          run('e', link),
          run(' '),
          run('f', link, strong),
          run(' '),
          run('[proposed]', marker, strong),
          run(' '),
          run('g', code),
          run('h', strong, code),
        ),
      ),
    );
  });

  it('keeps adjacent spans of different marks', () => {
    expectRoundTrip(documentOf(paragraph(run('a', strong), run('b', emphasis), run('c', strong))));
    expectRoundTrip(
      documentOf(paragraph(run('a', emphasis), run('b', strong), run('c', emphasis))),
    );
    expectRoundTrip(documentOf(paragraph(run('a', strong, emphasis), run('b', emphasis))));
  });

  it('keeps code with backticks and pipes', () => {
    expectRoundTrip(documentOf(paragraph(run('a`b', code), run(' and '), run('``', code))));
  });

  it('keeps links with awkward destinations', () => {
    for (const href of [
      'https://x.org/a(b)',
      'https://x.org/a%20b',
      '#section',
      'mailto:a@b.c',
      '#aaaaaaaaaa',
      '../other%20file.phrase.md#aaaaaaaaaa',
      'other.phrase.md',
    ]) {
      expectRoundTrip(documentOf(paragraph(run('see '), run('here', { type: 'link', href }))));
    }
  });

  it('keeps nested lists, tables, and code inside list items', () => {
    expectRoundTrip(
      documentOf({
        type: 'list',
        kind: 'numbered',
        items: [
          {
            blocks: [
              paragraph(run('intro')),
              {
                type: 'list',
                kind: 'bulleted',
                items: [{ blocks: [paragraph(run('inner'))] }],
              },
              { type: 'code', language: 'ts', text: 'let x = 1;\n\nlet y = 2;' },
              {
                type: 'table',
                header: [plainCell([run('H')])],
                rows: [[plainCell([run('c')])]],
              },
              { type: 'phrase', kind: 'diagram', text: 'a\nb' },
            ],
          },
          { blocks: [paragraph(run('second'))] },
        ],
      }),
    );
  });

  it('keeps adjacent lists of the same kind apart', () => {
    const list = (kind: 'bulleted' | 'numbered', text: string): Document['blocks'][number] => ({
      type: 'list',
      kind,
      items: [{ blocks: [paragraph(run(text))] }],
    });
    expectRoundTrip(
      documentOf(list('bulleted', 'a'), list('bulleted', 'b'), list('bulleted', 'c')),
    );
    expectRoundTrip(documentOf(list('numbered', 'a'), list('numbered', 'b')));
    expectRoundTrip(
      documentOf(list('bulleted', 'a'), list('numbered', 'b'), list('bulleted', 'c')),
    );
  });

  it('keeps annotations on every kind of block', () => {
    const id = 'k7m2q9x4zb' as never;
    const style = 'note' as StyleName;
    expectRoundTrip(
      documentOf(
        { type: 'heading', level: 3, id, style, content: [run('H')] },
        { type: 'paragraph', id, style, content: [run('P')] },
        { type: 'code', id, text: 'x' },
        {
          type: 'table',
          id,
          style,
          widths: [1, 2.5],
          header: [plainCell([run('A')]), plainCell([run('B')])],
          rows: [],
        },
        {
          type: 'list',
          kind: 'bulleted',
          id,
          items: [{ blocks: [{ type: 'paragraph', id, content: [run('x')] }] }],
        },
      ),
    );
  });
});

const ALPHABET = ['a', ' ', '*', '_', '`', '[', ']', '(', ')', '<', '>', '&', ';', '#', '-', '+'];
const MORE = ['!', '|', '\\', '1', '.', '~', '=', ':', '"', "'", '$', '\u00a0'];

function* strings(alphabet: readonly string[], maxLength: number): Generator<string> {
  let layer = [''];
  for (let length = 1; length <= maxLength; length += 1) {
    const next: string[] = [];
    for (const prefix of layer) for (const char of alphabet) next.push(prefix + char);
    yield* next;
    layer = next;
  }
}

describe('special characters survive a round trip', () => {
  it('in paragraphs', () => {
    for (const text of strings([...ALPHABET, ...MORE], 3)) {
      expectRoundTrip(documentOf(paragraph(run(text))));
    }
  });

  it('in headings', () => {
    for (const text of strings([...ALPHABET, ...MORE], 2)) {
      expectRoundTrip(documentOf({ type: 'heading', level: 2, content: [run(text)] }));
    }
  });

  it('in table cells', () => {
    for (const text of strings([...ALPHABET, ...MORE], 2)) {
      expectRoundTrip(
        documentOf({
          type: 'table',
          header: [plainCell([run('H')])],
          rows: [[plainCell([run(text)])]],
        }),
      );
    }
  });

  it('inside marks', () => {
    for (const text of strings(['a', ' ', '*', '_', '`', '[', ']', '(', ')', '<', '#', '|'], 3)) {
      for (const marks of [[strong], [emphasis], [code], [link], [strong, emphasis], [marker]]) {
        expectRoundTrip(documentOf(paragraph(run('x '), run(text, ...marks), run(' y'))));
      }
    }
  });
});

describe('random sequences of marked runs', () => {
  const words = ['a', 'b c', '*', 'x_y', '(z)', '1.', '[w]', ' ', 'é', '`', '#', '<b>', '&amp;'];
  const markSets: Mark[][] = [
    [],
    [],
    [strong],
    [emphasis],
    [code],
    [link],
    [marker],
    [strong, emphasis],
    [link, strong],
    [marker, emphasis],
    [link, strong, emphasis],
  ];

  it('round-trip', () => {
    // A fixed linear congruential generator keeps the test deterministic.
    let seed = 12345;
    const next = (limit: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    const total = Number(process.env['ROUNDTRIP_COUNT'] ?? 4000);
    for (let count = 0; count < total; count += 1) {
      const runs = Array.from({ length: 1 + next(6) }, () =>
        run(words[next(words.length)] ?? 'a', ...(markSets[next(markSets.length)] ?? [])),
      );
      expectRoundTrip(documentOf(paragraph(...runs)));
    }
  });
});

describe('a table with cells that are more than plain text', () => {
  const cell = (...blocks: CellBlock[]): TableCell => ({ blocks });
  const bullets = (...items: string[]): List => ({
    type: 'list',
    kind: 'bulleted',
    items: items.map((item) => ({ blocks: [paragraph(run(item))] })),
  });
  const tableOf = (header: TableCell[], ...rows: TableCell[][]): Document['blocks'][number] => ({
    type: 'table',
    header,
    rows,
  });
  const rich = tableOf(
    [plainCell([run('Control')]), plainCell([run('Notes')])],
    [plainCell([run('Logging')]), cell(paragraph(run('One')), paragraph(run('Two')))],
    [plainCell([run('Review')]), cell(bullets('monthly', 'after incidents'))],
    [cell(), plainCell([run('An empty first cell')])],
  );

  it('is written as a phrase-table block, with a list of rows of cells', () => {
    expect(serializeDocument(documentOf(rich))).toBe(
      [
        '---',
        'phrase-format: 1',
        '---',
        '',
        '```phrase-table',
        '- - Control',
        '  - Notes',
        '- - Logging',
        '  - One',
        '',
        '    Two',
        '- - Review',
        '  - - monthly',
        '    - after incidents',
        '- -',
        '  - An empty first cell',
        '```',
        '',
      ].join('\n'),
    );
  });

  it('keeps the annotation before the block, the same as for a pipe table', () => {
    const annotated = { ...rich, id: 'n3d8w5r1ya' as never, widths: [30, 70] };
    const text = serializeDocument(documentOf(annotated));
    expect(text).toContain('<!-- phrase: #n3d8w5r1ya widths="30 70" -->\n```phrase-table\n');
    expectRoundTrip(documentOf(annotated));
  });

  it('is still a pipe table when every cell is plain, so that GitHub shows a table', () => {
    const plain = tableOf([plainCell([run('A')])], [plainCell([run('b')])], [cell()]);
    expect(serializeDocument(documentOf(plain))).toContain('| A |\n| --- |\n| b |\n|  |\n');
  });

  it('round trips paragraphs, lists, empty cells and text that looks like markup', () => {
    expectRoundTrip(documentOf(rich));
    expectRoundTrip(
      documentOf(
        tableOf(
          [plainCell([run('H1')]), plainCell([run('H2')])],
          [
            cell(bullets('a', 'b')),
            cell(paragraph(run('- not a list')), paragraph(run('1. not a list either'))),
          ],
          [
            cell({
              type: 'list',
              kind: 'numbered',
              items: [{ blocks: [paragraph(run('one'), run(' two', strong))] }],
            }),
            cell(paragraph(run('a | b ', code), run('and `ticks`'))),
          ],
          [cell(paragraph(run('x', link)), bullets('y')), cell(bullets('p'), bullets('q'))],
        ),
      ),
    );
  });

  it('round trips nested lists in a cell, and a cell with a paragraph then a list', () => {
    const nested: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph(run('outer')), bullets('inner', 'more')] }],
    };
    expectRoundTrip(
      documentOf(tableOf([plainCell([run('H')])], [cell(paragraph(run('intro')), nested)])),
    );
  });

  it('round trips a table in a list item and next to a pipe table', () => {
    const list: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraph(run('item')), rich as never] }],
    };
    const pipe = tableOf([plainCell([run('A')])], [plainCell([run('b')])]);
    expectRoundTrip(documentOf(list, pipe, rich));
  });

  it('rewrites a phrase-table with only plain cells as a pipe table', () => {
    const text = '---\nphrase-format: 1\n---\n\n```phrase-table\n- - A\n  - B\n- - 1\n  - 2\n```\n';
    const parsed = parseDocument(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(serializeDocument(parsed.document)).toBe(
      '---\nphrase-format: 1\n---\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    );
  });
});
