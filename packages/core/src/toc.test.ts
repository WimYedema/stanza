import { describe, expect, it } from 'vitest';
import { validateDocument } from './document-validation.js';
import type { Block, Document, Heading, HeadingLevel, List } from './document.js';
import { isNodeId, type NodeId } from './ids.js';
import { plainStyle, sheet } from './stylesheet.testing.js';
import { collectTocEntries, readTocOptions, tocStyleName } from './toc.js';

const A: NodeId = (() => {
  const value = 'aaaaaaaaaa';
  if (!isNodeId(value)) throw new Error('invalid test ID');
  return value;
})();

const heading = (level: HeadingLevel, text: string, id?: NodeId): Heading => ({
  type: 'heading',
  level,
  content: [{ type: 'text', text, marks: [] }],
  ...(id !== undefined ? { id } : {}),
});
const toc = (text = ''): Block => ({ type: 'stanza', kind: 'toc', text });
const documentOf = (...blocks: Block[]): Document => ({ meta: { fields: {} }, blocks });

const withTocStyles = sheet({
  paragraph: { 'toc-1': plainStyle, 'toc-2': plainStyle, 'toc-3': plainStyle },
});
const codesOf = (document: Document, stylesheet = withTocStyles): string[] =>
  validateDocument(document, stylesheet).map((d) => d.code);

describe('readTocOptions', () => {
  it('defaults to depth 3 for an empty body', () => {
    expect(readTocOptions('')).toEqual({ options: { depth: 3 }, diagnostics: [] });
  });

  it('reads the depth', () => {
    expect(readTocOptions('depth: 2\n').options.depth).toBe(2);
    expect(readTocOptions('depth:6').options.depth).toBe(6);
  });

  it.each(['depth: 0', 'depth: 7', 'depth: two', 'depth:', 'levels: 2', 'nonsense'])(
    'reports "%s" and keeps the default depth',
    (body) => {
      const result = readTocOptions(body);
      expect(result.diagnostics.map((d) => d.code)).toEqual(['invalid-toc-options']);
      expect(result.options.depth).toBe(3);
    },
  );

  it('reports a depth that is given twice', () => {
    const result = readTocOptions('depth: 1\ndepth: 2');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.options.depth).toBe(1);
  });
});

describe('tocStyleName', () => {
  it('names the style of a level', () => {
    expect(tocStyleName(2)).toBe('toc-2');
  });
});

describe('collectTocEntries', () => {
  const blocks: Block[] = [
    heading(1, 'One', A),
    { type: 'paragraph', content: [{ type: 'text', text: 'Text', marks: [] }] },
    heading(2, 'Two'),
    heading(4, 'Deep'),
  ];

  it('takes the headings down to the depth, with their numbers and IDs', () => {
    expect(collectTocEntries(blocks, ['1', undefined, '1.1', '1.1.0.1'], 2)).toEqual([
      { level: 1, text: '1 One', id: A },
      { level: 2, text: '1.1 Two', id: undefined },
    ]);
  });

  it('gives the plain text of an unnumbered heading', () => {
    expect(collectTocEntries(blocks, [], 1)).toEqual([{ level: 1, text: 'One', id: A }]);
  });
});

describe('table of contents validation', () => {
  it('accepts a table of contents with its styles and a heading', () => {
    expect(codesOf(documentOf(heading(1, 'One', A), toc('depth: 2')))).toEqual([]);
  });

  it('reports a body that is not an option', () => {
    expect(codesOf(documentOf(heading(1, 'One', A), toc('size: 2')))).toContain(
      'invalid-toc-options',
    );
  });

  it('reports a missing style for each level of the depth', () => {
    const partial = sheet({ paragraph: { 'toc-1': plainStyle } });
    expect(codesOf(documentOf(heading(1, 'One', A), toc('depth: 3')), partial)).toEqual([
      'missing-toc-style',
      'missing-toc-style',
    ]);
  });

  it('needs no style for a level beyond the depth', () => {
    const partial = sheet({ paragraph: { 'toc-1': plainStyle } });
    expect(codesOf(documentOf(heading(1, 'One', A), toc('depth: 1')), partial)).toEqual([]);
  });

  it('warns when no heading falls within the depth', () => {
    expect(codesOf(documentOf(heading(2, 'Two', A), toc('depth: 1')))).toEqual(['toc-empty']);
    expect(codesOf(documentOf(toc()))).toEqual(['toc-empty']);
  });

  it('reports a table of contents in a list item', () => {
    const list: List = {
      type: 'list',
      kind: 'bulleted',
      items: [{ blocks: [{ type: 'stanza', kind: 'toc', text: '' }] }],
    };
    expect(codesOf(documentOf(heading(1, 'One', A), list))).toContain('toc-not-top-level');
  });
});
