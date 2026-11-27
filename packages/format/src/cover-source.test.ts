import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Cover, StyleName } from '@stanza/core';
import { coverSource, entriesSource, headerFooterSource } from './cover-source.js';
import { setBlock } from './edit-stylesheet.js';
import { parseStylesheet } from './stylesheet.js';

const name = (value: string) => value as StyleName;
const RESERVED = [
  'body',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'code',
  'list-bulleted',
  'list-numbered',
]
  .map((style) => `  ${style}: {}`)
  .join('\n');

/** A stylesheet with a page template, and what the template has after its size. */
const sheet = (template = ''): string =>
  `stanza-format: 1\n\nparagraph-styles:\n${RESERVED}\n  cover-title: {}\n\ntable-styles:\n  table: {}\n\npage-templates:\n  page:\n    size: A4 # the paper\n${template === '' ? '' : `${template}\n`}\n# after the templates\ntable-of-contents:\n  page-numbers: true\n`;

const templateOf = (text: string) => {
  const parsed = parseStylesheet(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.stylesheet.pageTemplates.get(name('page'));
};

const RICH: Cover = {
  kind: 'rows',
  margins: { topPt: 36, leftPt: 48.5 },
  rows: [
    {
      height: { kind: 'points', pt: 100 },
      valign: 'top',
      content: [{ kind: 'image', path: 'assets/logo.png', widthPt: 150, style: name('body') }],
    },
    {
      height: { kind: 'share', fr: 2.5 },
      valign: 'bottom',
      content: [
        {
          kind: 'paragraph',
          style: name('cover-title'),
          text: [
            { kind: 'text', text: "It's " },
            { kind: 'token', token: 'title', label: 'Untitled' },
          ],
        },
        {
          kind: 'table',
          style: name('table'),
          rows: [
            { label: 'Number', value: [{ kind: 'field', name: 'document-number', label: '' }] },
            { label: 'Fixed', value: [{ kind: 'text', text: 'a: b' }] },
          ],
        },
      ],
    },
    { height: { kind: 'share', fr: 1 }, valign: 'center', content: [] },
  ],
};

describe('coverSource and entriesSource', () => {
  it('write a cover of rows that reads back to the same model', () => {
    const source = coverSource(RICH);
    const text = setBlock(sheet(), ['page-templates', 'page', 'cover'], source);
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    expect(templateOf(text.text)?.cover).toEqual(RICH);
    expect(source.split('\n').slice(0, 4)).toEqual([
      'margins: { top: 36, left: 48.5 }',
      'rows:',
      '  - height: 100',
      '    content:',
    ]);
  });

  it('write a list cover, a title block, an empty table and no rows', () => {
    const entries = [
      { kind: 'image' as const, path: 'a b.png' },
      { kind: 'table' as const, style: name('table'), rows: [] },
    ];
    const list: Cover = { kind: 'list', entries };
    const empty: Cover = { kind: 'rows', rows: [] };
    for (const [path, block, expected] of [
      ['cover', coverSource(list), list],
      ['cover', coverSource(empty), empty],
      ['cover', coverSource({ kind: 'list', entries: [] }), { kind: 'list', entries: [] }],
    ] as const) {
      const text = setBlock(sheet(), ['page-templates', 'page', path], block);
      expect(text.ok && templateOf(text.text)?.cover).toEqual(expected);
    }
    const titled = setBlock(
      sheet(),
      ['page-templates', 'page', 'title-block'],
      entriesSource(entries),
    );
    expect(titled.ok && templateOf(titled.text)?.titleBlock).toEqual(entries);
    expect(entriesSource([])).toBe('[]');
  });

  it('write the covers of the example projects to the models they had', () => {
    const root = new URL('../../../examples/', import.meta.url);
    for (const example of readdirSync(root)) {
      const styles = new URL(`${example}/styles/`, root);
      let files: string[];
      try {
        files = readdirSync(styles);
      } catch {
        continue;
      }
      for (const file of files) {
        const text = readFileSync(new URL(file, styles), 'utf8').replaceAll('\r\n', '\n');
        for (const [template, page] of parseStylesheet(text).stylesheet.pageTemplates) {
          if (page.cover !== undefined) {
            const edited = setBlock(
              text,
              ['page-templates', template, 'cover'],
              coverSource(page.cover),
            );
            expect(edited.ok).toBe(true);
            if (edited.ok) {
              const again = parseStylesheet(edited.text).stylesheet.pageTemplates.get(template);
              expect(again?.cover).toEqual(page.cover);
            }
          }
          for (const band of ['header', 'footer'] as const) {
            const spec = page[band];
            if (spec === undefined) continue;
            const edited = setBlock(
              text,
              ['page-templates', template, band],
              headerFooterSource(spec),
            );
            expect(edited.ok).toBe(true);
            if (edited.ok) {
              const again = parseStylesheet(edited.text).stylesheet.pageTemplates.get(template);
              expect(again?.[band]).toEqual(spec);
            }
          }
          if (page.titleBlock !== undefined) {
            const edited = setBlock(
              text,
              ['page-templates', template, 'title-block'],
              entriesSource(page.titleBlock),
            );
            expect(edited.ok).toBe(true);
            if (edited.ok) {
              const again = parseStylesheet(edited.text).stylesheet.pageTemplates.get(template);
              expect(again?.titleBlock).toEqual(page.titleBlock);
            }
          }
        }
      }
    }
  });
});

describe('setBlock', () => {
  it('adds after a mapping that ends in a list, with the next key right after it', () => {
    const text = [
      'stanza-format: 1',
      'paragraph-styles:',
      '  body: {}',
      'page-templates:',
      '  page:',
      '    cover:',
      '      - text: x',
      'table-of-contents:',
      '  page-numbers: false',
      '',
    ].join('\n');
    const added = setBlock(text, ['page-templates', 'more'], 'size: A4');
    expect(added.ok && added.text).toBe(
      text.replace('      - text: x\n', '      - text: x\n  more:\n    size: A4\n'),
    );
  });

  const path = ['page-templates', 'page', 'cover'];

  it('adds the property after the last line of its mapping, and keeps the comments around it', () => {
    const result = setBlock(sheet(), path, "- text: 'A'");
    expect(result).toEqual({
      ok: true,
      text: sheet("    cover:\n      - text: 'A'"),
    });
  });

  it('replaces the lines of the property and the comments inside it, and nothing else', () => {
    const before = sheet("    cover:\n      # the old one\n      - text: 'A'\n      - text: 'B'");
    const result = setBlock(before, path, 'rows: []');
    expect(result).toEqual({ ok: true, text: sheet('    cover:\n      rows: []') });
    const flow = setBlock(before, path, '[]');
    expect(flow).toEqual({ ok: true, text: sheet('    cover: []') });
  });

  it('removes the property for nothing, and leaves the text as it is for the same block', () => {
    const before = sheet("    cover:\n      - text: 'A'");
    expect(setBlock(before, path, undefined)).toEqual({ ok: true, text: sheet() });
    expect(setBlock(before, path, "- text: 'A'")).toEqual({ ok: true, text: before });
  });

  it('refuses a block that makes an error, or a template that is not there', () => {
    const bad = setBlock(sheet(), path, '- style: nothing-like-it\n  text: x');
    expect(bad).toMatchObject({ ok: false, code: 'invalid-result' });
    const missing = setBlock(sheet(), ['page-templates', 'other', 'cover'], '[]');
    expect(missing).toMatchObject({ ok: false, code: 'invalid-path' });
  });
});
