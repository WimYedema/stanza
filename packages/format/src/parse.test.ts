import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse.js';

function parseBody(body: string) {
  return parseDocument(`---\nstanza-format: 1\n---\n\n${body}\n`);
}

function codes(body: string): string[] {
  return parseBody(body).diagnostics.map((d) => d.code);
}

describe('front matter', () => {
  it('reads the hardcoded fields and custom fields', () => {
    const { document, formatVersion, diagnostics } = parseDocument(
      [
        '---',
        'stanza-format: 1',
        'title: Plain title',
        'authors:',
        '  - A',
        '  - B',
        'classification: restricted',
        'doc-no: P-1',
        'keywords:',
        '  - x',
        '---',
        '',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(formatVersion).toBe(1);
    expect(document.meta).toEqual({
      title: 'Plain title',
      authors: ['A', 'B'],
      classification: 'restricted',
      fields: { 'doc-no': 'P-1', keywords: ['x'] },
    });
  });

  it('reads unquoted scalars as strings', () => {
    const { document } = parseDocument(
      '---\nstanza-format: 1\ntitle: no\nsign-off: 2026-10-13\ncount: 12\n---\n',
    );
    expect(document.meta).toEqual({
      title: 'no',
      fields: { 'sign-off': '2026-10-13', count: '12' },
    });
  });

  it('reports missing front matter and still parses the body', () => {
    const result = parseDocument('Just text\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['front-matter-missing']);
    expect(result.document.blocks).toHaveLength(1);
  });

  it('reports a missing format version', () => {
    const result = parseDocument('---\ntitle: "x"\n---\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['format-version-missing']);
    expect(result.formatVersion).toBeUndefined();
  });

  it('reports an unsupported format version', () => {
    const result = parseDocument('---\nstanza-format: 2\n---\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['format-version-unsupported']);
    expect(result.formatVersion).toBe(2);
  });

  it('reports invalid YAML and invalid values', () => {
    expect(parseDocument('---\nstanza-format: 1\ntitle: [\n---\n').diagnostics[0]?.code).toBe(
      'front-matter-invalid-yaml',
    );
    const invalid = parseDocument(
      '---\nstanza-format: 1\nauthors: someone\nNot_Kebab: x\nnested:\n  a: b\n---\n',
    );
    expect(invalid.diagnostics.map((d) => d.code)).toEqual([
      'front-matter-invalid',
      'front-matter-invalid-key',
      'front-matter-invalid',
    ]);
  });

  it('accepts CRLF line endings and a byte order mark', () => {
    const result = parseDocument('\uFEFF---\r\nstanza-format: 1\r\n---\r\n\r\nText\r\n');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.blocks).toHaveLength(1);
  });
});

describe('blocks', () => {
  it('applies an annotation to the next block', () => {
    const { document, diagnostics } = parseBody(
      '<!-- stanza: #k7m2q9x4zb .note -->\n## Title\n\n<!-- stanza: .cover-title -->\nText',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks).toEqual([
      expect.objectContaining({ type: 'heading', id: 'k7m2q9x4zb', style: 'note' }),
      expect.objectContaining({ type: 'paragraph', style: 'cover-title' }),
    ]);
  });

  it('reports an annotation without a following block', () => {
    expect(codes('Text\n\n<!-- stanza: #k7m2q9x4zb -->')).toEqual(['annotation-unused']);
  });

  it('keeps table widths only when they match the columns', () => {
    const ok = parseBody('<!-- stanza: widths="30 70" -->\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(ok.document.blocks[0]).toEqual(expect.objectContaining({ widths: [30, 70] }));
    expect(
      codes('<!-- stanza: widths="30 70 10" -->\n| A | B |\n| --- | --- |\n| 1 | 2 |'),
    ).toEqual(['widths-mismatch']);
    expect(codes('<!-- stanza: widths="30 70" -->\nText')).toEqual(['widths-not-table']);
  });

  it('pads and truncates table rows to the header width', () => {
    const { document } = parseBody('| A | B |\n| --- | --- |\n| 1 |\n| 1 | 2 | 3 |');
    const cell = (text: string) => ({
      blocks: [{ type: 'paragraph', content: [expect.objectContaining({ text })] }],
    });
    expect(document.blocks[0]).toEqual(
      expect.objectContaining({
        rows: [
          [cell('1'), { blocks: [] }],
          [cell('1'), cell('2')],
        ],
      }),
    );
  });

  it('reads code and stanza blocks', () => {
    const { document, diagnostics } = parseBody(
      '```ts\nlet x;\n```\n\n```stanza-chart\nraw\n```\n\n    indented\n',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks).toEqual([
      { type: 'code', language: 'ts', text: 'let x;' },
      { type: 'stanza', kind: 'chart', text: 'raw' },
      { type: 'code', text: 'indented' },
    ]);
  });

  it('accepts equivalent constructs that are not canonical', () => {
    const { document, diagnostics } = parseBody(
      'Setext\n======\n\n* star\n* bullets\n\n1. one\n2. two\n\n__strong__ and _em_',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks.map((b) => b.type)).toEqual(['heading', 'list', 'list', 'paragraph']);
  });

  it('treats bracketed text as plain text', () => {
    const { document, diagnostics } = parseBody(
      'A [proposed] note.\n\n[label]: https://example.com',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks).toHaveLength(2);
  });
});

describe('unsupported constructs are reported, not dropped silently', () => {
  it.each([
    ['a thematic break', 'Text\n\n---\n\nMore', ['thematic-break-unsupported']],
    ['a block quote', '> quoted', ['blockquote-unsupported']],
    ['an HTML block', '<div>x</div>', ['html-unsupported']],
    ['an ordinary comment', '<!-- note -->', ['html-unsupported']],
    ['a hard line break', 'one  \ntwo', ['hard-break-unsupported']],
    ['an image', '![alt](pic.png)', ['image-unsupported']],
    ['inline HTML', 'a <b>bold</b> b', ['inline-html-unsupported', 'inline-html-unsupported']],
    ['a link title', '[a](https://x.org "title")', ['link-title-unsupported']],
    ['a heading in a list', '- # Heading', ['heading-in-list']],
    ['a list start number', '3. three', ['list-start-unsupported']],
    ['table alignment', '| A |\n| :-: |\n| 1 |', ['table-alignment-unsupported']],
    ['extra fence info', '```ts title=x\ncode\n```', ['fence-info-ignored']],
    ['a stanza block without a kind', '```stanza-\nx\n```', ['stanza-block-kind-missing']],
  ])('%s', (_label, body, expected) => {
    expect(codes(body)).toEqual(expected);
  });

  it('keeps the content of a block quote and the alt text of an image', () => {
    expect(parseBody('> quoted').document.blocks).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'quoted', marks: [] }] },
    ]);
    expect(parseBody('![alt text](pic.png)').document.blocks).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'alt text', marks: [] }] },
    ]);
  });

  it('reports the source line', () => {
    const result = parseDocument('---\nstanza-format: 1\n---\n\nText\n\n---\n');
    expect(result.diagnostics).toEqual([expect.objectContaining({ line: 7 })]);
  });
});

describe('inline content', () => {
  it('produces flat runs with marks', () => {
    const { document } = parseBody('a **b *c* d** [e](https://x.org) `f`');
    expect(document.blocks[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'a ', marks: [] },
        { type: 'text', text: 'b ', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'c', marks: [{ type: 'strong' }, { type: 'emphasis' }] },
        { type: 'text', text: ' d', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' ', marks: [] },
        { type: 'text', text: 'e', marks: [{ type: 'link', href: 'https://x.org' }] },
        { type: 'text', text: ' ', marks: [] },
        { type: 'text', text: 'f', marks: [{ type: 'code' }] },
      ],
    });
  });

  it('turns a character style span into a style mark', () => {
    const { document, diagnostics } = parseBody('x <span class="marker">y</span> z');
    expect(diagnostics).toEqual([]);
    expect(document.blocks[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'x ', marks: [] },
        { type: 'text', text: 'y', marks: [{ type: 'style', name: 'marker' }] },
        { type: 'text', text: ' z', marks: [] },
      ],
    });
  });

  it('joins a soft line break into a space', () => {
    expect(parseBody('one\ntwo').document.blocks[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'one two', marks: [] }],
    });
  });
});

describe('stanza-table blocks', () => {
  const para = (text: string) => ({
    type: 'paragraph',
    content: [{ type: 'text', text, marks: [] }],
  });
  const table = (body: string) => parseBody(`\`\`\`stanza-table\n${body}\n\`\`\``);

  it('reads rows of cells, with paragraphs and lists in a cell, as a table', () => {
    const { document, diagnostics } = table(
      '- - H1\n  - H2\n- - one\n\n    two\n  - - a\n    - b\n- -\n  - last',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks).toEqual([
      {
        type: 'table',
        header: [{ blocks: [para('H1')] }, { blocks: [para('H2')] }],
        rows: [
          [
            { blocks: [para('one'), para('two')] },
            {
              blocks: [
                {
                  type: 'list',
                  kind: 'bulleted',
                  items: [{ blocks: [para('a')] }, { blocks: [para('b')] }],
                },
              ],
            },
          ],
          [{ blocks: [] }, { blocks: [para('last')] }],
        ],
      },
    ]);
  });

  it('takes the ID, style and widths from the annotation, as for a pipe table', () => {
    const { document, diagnostics } = parseBody(
      '<!-- stanza: #n3d8w5r1ya .table-grid widths="30 70" -->\n```stanza-table\n- - A\n  - B\n```',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks[0]).toMatchObject({
      type: 'table',
      id: 'n3d8w5r1ya',
      style: 'table-grid',
      widths: [30, 70],
    });
  });

  it('reads a table in a list item', () => {
    const { document, diagnostics } = parseBody(
      '- item\n\n  ```stanza-table\n  - - A\n  - - b\n\n      c\n  ```',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks[0]).toMatchObject({
      type: 'list',
      items: [
        { blocks: [{ type: 'paragraph' }, { type: 'table', rows: [[{ blocks: [{}, {}] }]] }] },
      ],
    });
  });

  it.each([
    ['an empty body', ''],
    ['text', 'just words'],
    ['a numbered list', '1. - A'],
    ['rows that are not lists of cells', '- A\n- B'],
    ['a row that holds a paragraph too', '- - A\n\n  text'],
    ['more than one list', '- - A\n\ntext\n\n- - B'],
    ['an annotation in the body', '<!-- stanza: #n3d8w5r1ya -->\n- - A'],
  ])('refuses %s', (_name, body) => {
    expect(codes(`\`\`\`stanza-table\n${body}\n\`\`\``)).toEqual(['invalid-table-body']);
  });

  it('refuses a block that a cell may not hold, and says where the table starts', () => {
    const { diagnostics } = parseBody(
      'text\n\n```stanza-table\n- - A\n- - ```ts\n    code\n    ```\n```',
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'table-cell-block', severity: 'error' }),
    ]);
  });

  it('points a problem inside a cell at its own line', () => {
    const { diagnostics } = parseBody('text\n\n```stanza-table\n- - A\n- - # heading\n```');
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'heading-in-list', line: 9 })]);
  });

  it('keeps rows of different length for the checks of the document to report', () => {
    const { document, diagnostics } = table('- - A\n  - B\n- - 1');
    expect(diagnostics).toEqual([]);
    expect(document.blocks[0]).toMatchObject({ rows: [[{ blocks: [para('1')] }]] });
  });
});
