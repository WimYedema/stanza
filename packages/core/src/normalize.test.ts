import { describe, expect, it } from 'vitest';
import type { Document, Inline, Mark } from './document.js';
import { normalizeDocument, normalizeInlines } from './normalize.js';
import { isStyleName } from './style-name.js';

const strong: Mark = { type: 'strong' };
const emphasis: Mark = { type: 'emphasis' };
const code: Mark = { type: 'code' };

function run(text: string, ...marks: Mark[]): Inline {
  return { type: 'text', text, marks };
}

function styleMark(name: string): Mark {
  if (!isStyleName(name)) throw new Error(`invalid style name: ${name}`);
  return { type: 'style', name };
}

describe('normalizeInlines', () => {
  it('drops empty runs', () => {
    expect(normalizeInlines([run(''), run('a'), run('', strong)])).toEqual([run('a')]);
  });

  it('merges adjacent runs with equal marks', () => {
    expect(normalizeInlines([run('a', strong), run('b', strong), run('c')])).toEqual([
      run('ab', strong),
      run('c'),
    ]);
  });

  it('keeps runs with different marks apart', () => {
    const a: Mark = { type: 'link', href: 'https://a.example' };
    const b: Mark = { type: 'link', href: 'https://b.example' };
    expect(normalizeInlines([run('x', a), run('y', b)])).toEqual([run('x', a), run('y', b)]);
  });

  it('orders marks canonically and removes duplicates', () => {
    const link: Mark = { type: 'link', href: 'https://a.example' };
    const marker = styleMark('marker');
    expect(normalizeInlines([run('x', code, emphasis, strong, marker, link, strong)])).toEqual([
      run('x', link, marker, strong, emphasis, code),
    ]);
  });

  it('moves edge whitespace out of marked runs', () => {
    expect(normalizeInlines([run(' bold ', strong)])).toEqual([
      run(' '),
      run('bold', strong),
      run(' '),
    ]);
  });

  it('merges moved whitespace into neighbouring plain text', () => {
    expect(normalizeInlines([run('a'), run(' b ', strong), run('c')])).toEqual([
      run('a '),
      run('b', strong),
      run(' c'),
    ]);
  });

  it('removes the marks from whitespace-only runs', () => {
    expect(normalizeInlines([run('a'), run('  ', strong), run('b')])).toEqual([run('a  b')]);
  });

  it('leaves whitespace inside marked runs alone', () => {
    expect(normalizeInlines([run('a b', strong)])).toEqual([run('a b', strong)]);
  });

  it('is idempotent', () => {
    const input = [run(' a ', strong, emphasis), run('b', emphasis, strong), run(''), run(' c')];
    const once = normalizeInlines(input);
    expect(normalizeInlines(once)).toEqual(once);
  });
});

describe('normalizeDocument', () => {
  it('normalizes headings, list items, and table cells, and leaves metadata alone', () => {
    const messy = [run('a', strong), run('b', strong)];
    const clean = [run('ab', strong)];
    const document: Document = {
      meta: { title: ' Keep ', fields: {} },
      blocks: [
        { type: 'heading', level: 1, content: messy },
        {
          type: 'list',
          kind: 'bulleted',
          items: [{ blocks: [{ type: 'paragraph', content: messy }] }],
        },
        { type: 'table', header: [{ content: messy }], rows: [[{ content: messy }]] },
        { type: 'code', text: 'a  b' },
      ],
    };

    expect(normalizeDocument(document)).toEqual({
      meta: { title: ' Keep ', fields: {} },
      blocks: [
        { type: 'heading', level: 1, content: clean },
        {
          type: 'list',
          kind: 'bulleted',
          items: [{ blocks: [{ type: 'paragraph', content: clean }] }],
        },
        { type: 'table', header: [{ content: clean }], rows: [[{ content: clean }]] },
        { type: 'code', text: 'a  b' },
      ],
    });
  });
});
