import { describe, expect, it } from 'vitest';
import type { Block, Inline } from '@phrase/core';
import { adoptMarkdown } from './adopt.js';
import { parseDocument } from './parse.js';
import { serializeDocument } from './serialize.js';

function adopted(source: string) {
  const result = adoptMarkdown(source);
  if (!result.ok) throw new Error(result.message);
  return result;
}

const codes = (source: string): string[] => adopted(source).report.diagnostics.map((d) => d.code);

const textOf = (block: Block | undefined): string =>
  block !== undefined && 'content' in block
    ? block.content.map((inline: Inline) => inline.text).join('')
    : '';

describe('adoptMarkdown', () => {
  it('reads a Markdown file without front matter, with nothing to report', () => {
    const { document, report } = adopted(
      '# Notes\n\nA *first* paragraph.\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
    );
    expect(document.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'table']);
    expect(document.meta).toEqual({ fields: {} });
    expect(report.diagnostics).toEqual([]);
  });

  it('writes a document that the dialect reads back without a finding', () => {
    const { document } = adopted(
      '# Notes\n\nText with `code` and [a link](https://example.com).\n',
    );
    const text = serializeDocument({ ...document, meta: { title: 'Notes', fields: {} } });
    const again = parseDocument(text);
    expect(again.diagnostics).toEqual([]);
    expect(again.document.blocks).toEqual(document.blocks);
  });

  describe('front matter', () => {
    it('keeps a title that is text, and names the other keys that are left out', () => {
      const { document, report } = adopted(
        '---\ntitle: "Release notes"\nlayout: post\ntags: [a, b]\n---\n\n# Hi\n',
      );
      expect(document.meta).toEqual({ title: 'Release notes', fields: {} });
      expect(report.diagnostics).toEqual([
        {
          severity: 'info',
          code: 'front-matter-keys',
          message: 'Front matter keys were left out.',
          count: 2,
          places: ['layout', 'tags'],
        },
      ]);
    });

    it('counts lines of the source, front matter included', () => {
      const { report } = adopted('---\ntitle: T\n---\n\n# Hi\n\n---\n');
      expect(report.diagnostics[0]).toMatchObject({
        code: 'thematic-break-unsupported',
        places: ['line 7'],
      });
    });

    it('leaves out front matter that is not YAML, and says so', () => {
      const { document, report } = adopted('---\na: [\n---\n\nText\n');
      expect(document.meta).toEqual({ fields: {} });
      expect(report.diagnostics.map((d) => [d.severity, d.code])).toEqual([
        ['warning', 'front-matter-unreadable'],
      ]);
      expect(textOf(document.blocks[0])).toBe('Text');
    });

    it('refuses a file that is a Phrase document already', () => {
      const result = adoptMarkdown('---\nphrase-format: 1\ntitle: T\n---\n\nText\n');
      expect(result).toMatchObject({ ok: false, reason: 'already-phrase' });
    });
  });

  describe('the report', () => {
    it('names content that is gone as a warning, and content kept in another form as info', () => {
      const { report } = adopted(
        [
          '# T',
          '',
          '> quoted',
          '',
          '---',
          '',
          '<div>raw</div>',
          '',
          'line one  ',
          'line two',
          '',
          '![alt text](a.png "t")',
          '',
          '[x](https://example.com "title")',
          '',
          '3. third',
          '',
          '| a | b |',
          '| :- | -: |',
          '| 1 | 2 |',
          '',
        ].join('\n'),
      );
      const severities = Object.fromEntries(report.diagnostics.map((d) => [d.code, d.severity]));
      expect(severities).toEqual({
        'thematic-break-unsupported': 'warning',
        'html-unsupported': 'warning',
        'blockquote-unsupported': 'info',
        'hard-break-unsupported': 'info',
        'image-unsupported': 'info',
        'link-title-unsupported': 'info',
        'table-alignment-unsupported': 'info',
        'list-start-unsupported': 'info',
      });
    });

    it('lists warnings first, then the rest in a fixed order', () => {
      expect(codes('> q\n\n---\n\n<p>x</p>\n')).toEqual([
        'thematic-break-unsupported',
        'html-unsupported',
        'blockquote-unsupported',
      ]);
    });

    it('groups a finding by code, with a count and the lines of the first cases', () => {
      const lines = `Intro\n\n${Array.from({ length: 12 }, () => '---\n').join('\n')}`;
      const [entry] = adopted(lines).report.diagnostics;
      expect(entry?.count).toBe(12);
      expect(entry?.places).toHaveLength(10);
      expect(entry?.places[0]).toBe('line 3');
    });

    it('keeps the content of a block quote and the alt text of an image', () => {
      const { document } = adopted('> inside\n\n![alt text](a.png)\n');
      expect(document.blocks.map(textOf)).toEqual(['inside', 'alt text']);
    });
  });

  it('turns reference links into ordinary links, and reports the definitions', () => {
    const { document, report } = adopted(
      'See [the guide][g] and [docs].\n\n[g]: https://example.com/guide\n[docs]: https://example.com/docs\n',
    );
    expect(document.blocks).toHaveLength(1);
    const [paragraph] = document.blocks;
    if (paragraph?.type !== 'paragraph') throw new Error('Expected a paragraph.');
    const links = paragraph.content.flatMap((inline) =>
      inline.marks.filter((m) => m.type === 'link'),
    );
    expect(links).toEqual([
      { type: 'link', href: 'https://example.com/guide' },
      { type: 'link', href: 'https://example.com/docs' },
    ]);
    expect(report.diagnostics).toEqual([
      {
        severity: 'info',
        code: 'reference-links',
        message: 'Reference links were turned into ordinary links.',
        count: 2,
        places: ['g', 'docs'],
      },
    ]);
  });

  it('does not change how the dialect reader treats reference links', () => {
    const parsed = parseDocument(
      '---\nphrase-format: 1\n---\n\nSee [docs].\n\n[docs]: https://example.com\n',
    );
    expect(textOf(parsed.document.blocks[0])).toBe('See [docs].');
  });
});
