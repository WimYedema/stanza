import { describe, expect, it } from 'vitest';
import type { StyleName } from '@stanza/core';
import { parseStylesheet } from './stylesheet.js';

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

const sheet = (header: string): string =>
  `stanza-format: 1\nparagraph-styles:\n${RESERVED}\ntable-styles:\n  table: {}\npage-templates:\n  page:\n    size: A4\n${header}`;

const page = (text: string) =>
  parseStylesheet(text).stylesheet.pageTemplates.get('page' as StyleName);
const problems = (text: string) =>
  parseStylesheet(text).diagnostics.map((d) => [d.code, d.path ?? '']);

describe('the header and footer of a page template (ADR 0095)', () => {
  it('reads a grid with rows that grow by default, and a distance', () => {
    const text = sheet(
      [
        '    header:',
        '      distance: 20',
        '      columns: [80, 1fr]',
        '      areas:',
        '        - logo text',
        '      area:',
        '        logo:',
        '          content:',
        '            - { image: assets/logo.png, width: 60 }',
        '        text:',
        "          content: [{ text: 'Page [1](stanza:page) of [1](stanza:pages)' }]",
        '',
      ].join('\n'),
    );
    expect(problems(text)).toEqual([]);
    const header = page(text)?.header;
    expect(header).toMatchObject({ distancePt: 20, left: [], center: [], right: [] });
    expect(header?.grid?.rows).toEqual([{ kind: 'auto' }]);
    expect(header?.grid?.area['text']?.content[0]).toEqual({
      kind: 'paragraph',
      text: [
        { kind: 'text', text: 'Page ' },
        { kind: 'token', token: 'page', label: '1' },
        { kind: 'text', text: ' of ' },
        { kind: 'token', token: 'pages', label: '1' },
      ],
    });
  });

  it('reads a distance beside the slots, and refuses slots beside areas', () => {
    expect(page(sheet("    footer:\n      distance: 18\n      left: 'x'\n"))?.footer).toMatchObject(
      {
        distancePt: 18,
        left: [{ kind: 'text', text: 'x' }],
      },
    );
    expect(problems(sheet("    header:\n      left: 'x'\n      areas:\n        - a\n"))).toEqual([
      ['unknown-property', 'page-templates.page.header.left'],
    ]);
    expect(problems(sheet('    header:\n      distance: far\n'))).toEqual([
      ['invalid-type', 'page-templates.page.header.distance'],
    ]);
  });
});
