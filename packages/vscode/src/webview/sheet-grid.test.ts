// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { parseDocument, parseStylesheet } from '@stanza/format';
import { createSheet } from './sheet.js';

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
  .map((name) => `  ${name}: {}`)
  .join('\n');

const stylesheet = parseStylesheet(
  [
    'stanza-format: 1',
    'tokens:',
    '  colors:',
    "    band: '#17607F'",
    'paragraph-styles:',
    RESERVED,
    'table-styles:',
    '  table: {}',
    'page-templates:',
    '  page:',
    '    size: A4',
    '    margins: { top: 72, right: 72, bottom: 72, left: 72 }',
    '    cover:',
    '      margins: { top: 36, right: 48, bottom: 48, left: 48 }',
    '      columns: [100, 1fr]',
    '      rows: [80, 1fr]',
    '      areas:',
    '        - side logo',
    '        - side title',
    '      area:',
    '        side:',
    '          valign: bottom',
    '          background: band',
    '          content:',
    "            - text: 'Side'",
    '        title:',
    '          valign: center',
    '          content:',
    "            - text: '[Untitled](stanza:title)'",
    '',
  ].join('\n'),
).stylesheet;

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe('the sheet of a cover grid (ADR 0092)', () => {
  it('draws an area for each name, where it is and as high as its rows, and nothing for an empty one', () => {
    const cover = document.createElement('div');
    const header = document.createElement('div');
    const footer = document.createElement('div');
    document.body.append(cover, header, footer);
    createSheet({ cover, header, footer }).update({
      stylesheet,
      defaults: {},
      document: parseDocument('---\nstanza-format: 1\ntitle: "My Doc"\n---\n\nText.\n').document,
    });
    expect(cover.hidden).toBe(false);
    expect(cover.style.padding).toBe('36pt 48pt 48pt');
    const areas = [...cover.querySelectorAll<HTMLElement>('.cover-area')];
    expect(areas.map((area) => area.style.backgroundColor)).toEqual(['rgb(23, 96, 127)', '', '']);
    expect(
      areas.map((area) => [
        area.dataset['area'],
        area.dataset['row'],
        area.dataset['column'],
        area.style.height,
        area.style.justifyContent,
        area.textContent,
      ]),
    ).toEqual([
      // 757.9 pt between the margins, less 2 pt for the end of the section.
      ['side', '1', '1', '755.9pt', 'flex-end', 'Side'],
      ['logo', '1', '2', '80pt', 'flex-start', ''],
      ['title', '2', '2', '675.9pt', 'center', 'My Doc'],
    ]);
  });
});
