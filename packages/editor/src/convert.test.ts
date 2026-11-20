import { readFileSync, readdirSync } from 'node:fs';
import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import type { Document } from '@stanza/core';
import { parseDocument, serializeDocument } from '@stanza/format';
import { fromEditorContent, toEditorContent } from './convert.js';
import { schemaExtensions } from './schema.js';

const schema = getSchema(schemaExtensions());

const read = (url: URL): string => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

function viaEditor(document: Document): Document {
  const node = schema.nodeFromJSON(toEditorContent(document));
  node.check();
  const result = fromEditorContent(node, document.meta);
  expect(result.diagnostics).toEqual([]);
  if (result.document === undefined) throw new Error('No document.');
  return result.document;
}

const formats = new URL('../../../fixtures/format/', import.meta.url);
const project = new URL('../../../fixtures/example-project/documents/', import.meta.url);
const fixtures = [
  ...readdirSync(formats)
    .filter((name) => name.endsWith('.stanza.md'))
    .map((name) => [`format/${name}`, new URL(name, formats)] as const),
  ...readdirSync(project)
    .filter((name) => name.endsWith('.stanza.md'))
    .map((name) => [`example-project/${name}`, new URL(name, project)] as const),
];

describe('conversion of the fixtures', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(8);
  });

  it.each(fixtures)('%s goes through the editor and comes back the same', (_name, url) => {
    const text = read(url);
    const parsed = parseDocument(text);
    expect(parsed.diagnostics).toEqual([]);
    const back = viaEditor(parsed.document);
    expect(back).toEqual(parsed.document);
    expect(serializeDocument(back)).toBe(text);
  });
});

function parse(body: string): Document {
  const parsed = parseDocument(`---\nstanza-format: 1\n---\n\n${body}`);
  expect(parsed.diagnostics).toEqual([]);
  return parsed.document;
}

describe('toEditorContent', () => {
  it('writes a heading, a table and a code block with their attributes', () => {
    const document = parse(
      '<!-- stanza: #k7m2q9x4zb .note -->\n## Title\n\n<!-- stanza: widths="30 70" -->\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nlet x;\n```\n',
    );
    const content = toEditorContent(document);
    expect(content.content?.[0]).toEqual({
      type: 'heading',
      attrs: { id: 'k7m2q9x4zb', style: 'note', level: 2 },
      content: [{ type: 'text', text: 'Title' }],
    });
    expect(content.content?.[1]?.attrs).toEqual({ widths: [30, 70] });
    expect(content.content?.[1]?.content?.map((row) => row.content?.[0]?.type)).toEqual([
      'tableHeader',
      'tableCell',
    ]);
    expect(content.content?.[2]).toEqual({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'let x;' }],
    });
  });

  it('writes the marks of a run in the order of the model', () => {
    const document = parse('A **bold *both*** [link](https://example.org).\n');
    const runs = toEditorContent(document).content?.[0]?.content ?? [];
    expect(runs.map((run) => run.marks?.map((mark) => mark.type))).toEqual([
      undefined,
      ['strong'],
      ['strong', 'emphasis'],
      undefined,
      ['link'],
      undefined,
    ]);
  });
});

describe('fromEditorContent', () => {
  const meta = { title: 'T', fields: { 'document-number': 'N' } };
  const docOf = (blocks: unknown[]) => schema.nodeFromJSON({ type: 'doc', content: blocks });

  it('gives the metadata back that it was given', () => {
    const result = fromEditorContent(docOf([]), meta);
    expect(result).toEqual({ document: { meta, blocks: [] }, diagnostics: [] });
  });

  it('writes a document in normal form: runs merged, marks in order', () => {
    const strong = { type: 'strong' };
    const em = { type: 'emphasis' };
    const node = docOf([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', marks: [em, strong] },
          { type: 'text', text: 'b', marks: [strong, em] },
        ],
      },
    ]);
    const result = fromEditorContent(node, meta);
    expect(result.document?.blocks).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'ab', marks: [strong, em] }],
      },
    ]);
  });

  it('keeps a table without a header row and one without any cells', () => {
    const noHeader = docOf([
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [] }] }],
      },
      { type: 'table', content: [] },
    ]);
    const { document, diagnostics } = fromEditorContent(noHeader, meta);
    expect(diagnostics).toEqual([]);
    expect(document?.blocks).toEqual([
      { type: 'table', header: [], rows: [[{ blocks: [] }]] },
      { type: 'table', header: [], rows: [] },
    ]);
  });

  it('keeps an empty list item, an empty code block and a stanza block as they are', () => {
    const node = docOf([
      { type: 'bulletList', content: [{ type: 'listItem', content: [] }] },
      { type: 'codeBlock' },
      { type: 'stanzaBlock', attrs: { kind: 'toc', text: 'depth: 2' } },
    ]);
    expect(fromEditorContent(node, meta).document?.blocks).toEqual([
      { type: 'list', kind: 'bulleted', items: [{ blocks: [] }] },
      { type: 'code', text: '' },
      { type: 'stanza', kind: 'toc', text: 'depth: 2' },
    ]);
  });

  const problems = (blocks: unknown[]): string[] => {
    const result = fromEditorContent(docOf(blocks), meta);
    expect(result.document).toBeUndefined();
    return result.diagnostics.map((d) => `${d.code} ${d.path ?? ''}`);
  };

  it('reports what the model cannot hold, and gives no document', () => {
    expect(problems([{ type: 'heading', attrs: { level: 9 } }])).toEqual([
      'editor-invalid-content blocks[0]',
    ]);
    expect(problems([{ type: 'paragraph', attrs: { id: 'nope', style: 'Not A Name' } }])).toEqual([
      'editor-invalid-content blocks[0]',
      'editor-invalid-content blocks[0]',
    ]);
    expect(problems([{ type: 'table', attrs: { widths: [1, -2] } }])).toEqual([
      'editor-invalid-content blocks[0]',
    ]);
    expect(
      problems([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'style', attrs: { name: 'Not A Name' } }],
            },
          ],
        },
      ]),
    ).toEqual(['editor-invalid-content blocks[0]']);
  });

  it('reports merged cells and header cells below the first row', () => {
    const cell = (type: string, attrs: object = {}) => ({ type, attrs, content: [] });
    expect(
      problems([
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('tableHeader')] },
            {
              type: 'tableRow',
              content: [cell('tableCell', { colspan: 2 }), cell('tableHeader')],
            },
          ],
        },
      ]),
    ).toEqual([
      'editor-invalid-content blocks[0].rows[0].cells[0]',
      'editor-invalid-content blocks[0].rows[0].cells[1]',
    ]);
  });

  it('takes the paragraphs and lists of a cell through the editor and back', () => {
    const paragraphOf = (text: string) =>
      ({ type: 'paragraph', content: [{ type: 'text', text, marks: [] }] }) as const;
    const list = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [paragraphOf('a'), paragraphOf('a2')] }, { blocks: [paragraphOf('b')] }],
    } as const;
    const document: Document = {
      meta: { fields: {} },
      blocks: [
        {
          type: 'table',
          header: [{ blocks: [paragraphOf('H')] }, { blocks: [] }],
          rows: [[{ blocks: [paragraphOf('one'), paragraphOf('two'), list] }, { blocks: [list] }]],
        },
      ],
    };
    expect(viaEditor(document)).toEqual(document);
  });

  it('gives an empty cell an empty paragraph in the editor, since a cell always holds a block', () => {
    const document: Document = {
      meta: { fields: {} },
      blocks: [{ type: 'table', header: [{ blocks: [] }], rows: [] }],
    };
    const content = toEditorContent(document);
    expect(content.content?.[0]?.content?.[0]?.content?.[0]?.content).toEqual([
      { type: 'paragraph' },
    ]);
  });

  it('refuses what a cell may not hold: a style or an ID on its blocks, and code in its lists', () => {
    const cellOf = (...content: object[]) =>
      docOf([
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [{ type: 'tableCell', content }] }],
        },
      ]);
    const problems = (node: ReturnType<typeof docOf>) =>
      fromEditorContent(node, meta).diagnostics.map((d) => `${d.code} ${d.path ?? ''}`);
    expect(problems(cellOf({ type: 'paragraph', attrs: { style: 'note' } }))).toEqual([
      'editor-invalid-content blocks[0].rows[0].cells[0].blocks[0]',
    ]);
    expect(
      problems(
        cellOf({
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'codeBlock' }] }],
        }),
      ),
    ).toEqual(['editor-invalid-content blocks[0].rows[0].cells[0].blocks[0].items[0].blocks[0]']);
  });
});
