import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { BLOCK_ATTRIBUTES, MARK_ATTRIBUTES, MARK_TYPES } from '@stanza/core';
import { schemaExtensions } from './schema.js';

const schema = getSchema(schemaExtensions());
const attributesOf = (node: string): string[] =>
  Object.keys(schema.nodes[node]?.spec.attrs ?? {}).sort();

describe('the schema against the vocabulary of core', () => {
  it('has the marks in canonical order, with the attributes of core', () => {
    expect(Object.keys(schema.marks)).toEqual([...MARK_TYPES]);
    for (const mark of MARK_TYPES) {
      expect(Object.keys(schema.marks[mark]?.spec.attrs ?? {}).sort()).toEqual(
        [...MARK_ATTRIBUTES[mark]].sort(),
      );
    }
  });

  it('has a node for each kind of block, with the attributes of core', () => {
    const own = (kind: keyof typeof BLOCK_ATTRIBUTES): string[] =>
      [...BLOCK_ATTRIBUTES[kind]].sort();
    expect(attributesOf('heading')).toEqual(own('heading'));
    expect(attributesOf('paragraph')).toEqual(own('paragraph'));
    expect(attributesOf('table')).toEqual(own('table'));
    expect(attributesOf('codeBlock')).toEqual(own('code'));
    expect(attributesOf('stanzaBlock')).toEqual(own('stanza'));
    // The kind of a list is the node: a bulleted or a numbered list.
    const list = own('list').filter((name) => name !== 'kind');
    expect(attributesOf('bulletList')).toEqual(list);
    expect(attributesOf('orderedList')).toEqual(list);
  });

  it('has no other attributes, so nothing can carry formatting', () => {
    const structure = ['doc', 'text', 'listItem', 'tableRow'];
    for (const name of structure) expect(attributesOf(name)).toEqual([]);
    // The table library reads these, and they are always their default value.
    for (const name of ['tableCell', 'tableHeader']) {
      expect(attributesOf(name)).toEqual(['colspan', 'colwidth', 'rowspan']);
    }
    const known = new Set([
      ...structure,
      'tableCell',
      'tableHeader',
      'heading',
      'paragraph',
      'table',
      'codeBlock',
      'stanzaBlock',
      'bulletList',
      'orderedList',
    ]);
    expect(Object.keys(schema.nodes).filter((name) => !known.has(name))).toEqual([]);
  });

  it('has table cells of paragraphs and lists, and no marks in code', () => {
    expect(schema.nodes['tableCell']?.spec.content).toBe('cellBlock+');
    expect(schema.nodes['tableHeader']?.spec.content).toBe('cellBlock+');
    expect(schema.nodes['codeBlock']?.spec.marks).toBe('');
  });
});

/** The attribute names that an output spec of the DOM writes, and the elements. */
function written(spec: unknown, into: Set<string>): void {
  if (!Array.isArray(spec)) return;
  const [tag, second, ...rest] = spec as unknown[];
  if (typeof tag === 'string') into.add(`<${tag}>`);
  const hasAttributes = typeof second === 'object' && second !== null && !Array.isArray(second);
  if (hasAttributes) for (const name of Object.keys(second)) into.add(name);
  for (const child of hasAttributes ? rest : [second, ...rest]) written(child, into);
}

describe('the markup that the schema writes', () => {
  it('has no inline style, alignment, width or span attributes', () => {
    const node = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, id: 'k7m2q9x4zb', style: 'note' }, content: [] },
        {
          type: 'table',
          attrs: { widths: [30, 70], style: 'table-grid' },
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'text', text: 'A' }] },
                { type: 'tableCell', content: [] },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [
                { type: 'link', attrs: { href: 'https://example.org' } },
                { type: 'style', attrs: { name: 'marker' } },
                { type: 'strong' },
                { type: 'emphasis' },
              ],
            },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'stanzaBlock', attrs: { kind: 'toc', text: 'depth: 2' } },
      ],
    });
    const names = new Set<string>();
    node.descendants((child) => {
      const spec = child.type.spec.toDOM?.(child);
      written(spec, names);
      for (const mark of child.marks) written(mark.type.spec.toDOM?.(mark, true), names);
    });
    const attributes = [...names].filter((name) => !name.startsWith('<'));
    // Names and texts that travel in the clipboard HTML are data attributes, never `style`.
    expect(attributes.sort()).toEqual([
      'class',
      'data-stanza-kind',
      'data-stanza-style',
      'data-stanza-text',
      'href',
    ]);
    expect(attributes).not.toContain('style');
    expect([...names].filter((name) => name.startsWith('<')).sort()).toEqual([
      '<a>',
      '<div>',
      '<em>',
      '<h2>',
      '<p>',
      '<pre>',
      '<span>',
      '<strong>',
      '<table>',
      '<tbody>',
      '<td>',
      '<th>',
      '<tr>',
    ]);
  });
});
