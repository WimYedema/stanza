import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse.js';

function parseBody(body: string) {
  return parseDocument(`---\nphrase-format: 1\n---\n\n${body}\n`);
}

function codes(body: string): string[] {
  return parseBody(body).diagnostics.map((d) => d.code);
}

describe('front matter', () => {
  it('reads the hardcoded fields and custom fields', () => {
    const { document, formatVersion, diagnostics } = parseDocument(
      [
        '---',
        'phrase-format: 1',
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
      '---\nphrase-format: 1\ntitle: no\nsign-off: 2026-10-13\ncount: 12\n---\n',
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
    const result = parseDocument('---\nphrase-format: 2\n---\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['format-version-unsupported']);
    expect(result.formatVersion).toBe(2);
  });

  it('reports invalid YAML and invalid values', () => {
    expect(parseDocument('---\nphrase-format: 1\ntitle: [\n---\n').diagnostics[0]?.code).toBe(
      'front-matter-invalid-yaml',
    );
    const invalid = parseDocument(
      '---\nphrase-format: 1\nauthors: someone\nNot_Kebab: x\nnested:\n  a: b\n---\n',
    );
    expect(invalid.diagnostics.map((d) => d.code)).toEqual([
      'front-matter-invalid',
      'front-matter-invalid-key',
      'front-matter-invalid',
    ]);
  });

  it('accepts CRLF line endings and a byte order mark', () => {
    const result = parseDocument('\uFEFF---\r\nphrase-format: 1\r\n---\r\n\r\nText\r\n');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.blocks).toHaveLength(1);
  });
});

describe('blocks', () => {
  it('applies an annotation to the next block', () => {
    const { document, diagnostics } = parseBody(
      '<!-- phrase: #k7m2q9x4zb .note -->\n## Title\n\n<!-- phrase: .cover-title -->\nText',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks).toEqual([
      expect.objectContaining({ type: 'heading', id: 'k7m2q9x4zb', style: 'note' }),
      expect.objectContaining({ type: 'paragraph', style: 'cover-title' }),
    ]);
  });

  it('reports an annotation without a following block', () => {
    expect(codes('Text\n\n<!-- phrase: #k7m2q9x4zb -->')).toEqual(['annotation-unused']);
  });

  it('keeps table widths only when they match the columns', () => {
    const ok = parseBody('<!-- phrase: widths="30 70" -->\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(ok.document.blocks[0]).toEqual(expect.objectContaining({ widths: [30, 70] }));
    expect(
      codes('<!-- phrase: widths="30 70 10" -->\n| A | B |\n| --- | --- |\n| 1 | 2 |'),
    ).toEqual(['widths-mismatch']);
    expect(codes('<!-- phrase: widths="30 70" -->\nText')).toEqual(['widths-not-table']);
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

  it('reads code and phrase blocks', () => {
    const { document, diagnostics } = parseBody(
      '```ts\nlet x;\n```\n\n```phrase-table\nraw\n```\n\n    indented\n',
    );
    expect(diagnostics).toEqual([]);
    expect(document.blocks).toEqual([
      { type: 'code', language: 'ts', text: 'let x;' },
      { type: 'phrase', kind: 'table', text: 'raw' },
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
    ['a phrase block without a kind', '```phrase-\nx\n```', ['phrase-block-kind-missing']],
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
    const result = parseDocument('---\nphrase-format: 1\n---\n\nText\n\n---\n');
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
