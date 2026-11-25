// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StyleName } from '@stanza/core';
import { parseStylesheet } from '@stanza/format';
import { createCoverPreview, sampleMeta, type CoverPreview } from './styles-cover-preview.js';

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
    'paragraph-styles:',
    RESERVED,
    'table-styles:',
    '  table: {}',
    'page-templates:',
    '  page:',
    '    size: Letter',
    '    margins: { top: 50, right: 60, bottom: 70, left: 80 }',
    '    cover:',
    "      - text: '[Untitled](stanza:title) for [](stanza:field:client)'",
    '    title-block:',
    '      - image: assets/logo.png',
    "      - text: '[](stanza:authors)'",
    '  bare:',
    '    size: A4',
    '',
  ].join('\n'),
).stylesheet;
const template = (name: string) => stylesheet.pageTemplates.get(name as StyleName);

let preview: CoverPreview;
const elements = {
  root: document.createElement('div'),
  cover: document.createElement('div'),
  first: document.createElement('div'),
  titleBlock: document.createElement('div'),
};

beforeEach(() => {
  elements.first.append(elements.titleBlock);
  elements.root.append(elements.cover, elements.first);
  document.body.append(elements.root);
  preview = createCoverPreview(elements);
});
afterEach(() => {
  document.body.replaceChildren();
});

describe('sampleMeta', () => {
  it('has sample values, and the name of each field the template shows', () => {
    const page = template('page');
    if (page === undefined) throw new Error('No template.');
    expect(sampleMeta(page)).toEqual({
      title: 'Title of the document',
      authors: ['First Author', 'Second Author'],
      classification: 'Internal',
      fields: { client: '‹client›' },
    });
  });
});

describe('the cover preview', () => {
  it('draws the cover on a sheet of the page size with the margins of the page', () => {
    preview.show(template('page'), stylesheet);
    expect(elements.root.hidden).toBe(false);
    expect(elements.cover.textContent).toBe('Title of the document for ‹client›');
    expect(elements.cover.style.width).toBe('612pt');
    expect(elements.cover.style.padding).toBe('50pt 60pt 70pt 80pt');
    expect(elements.cover.classList.contains('stanza-document')).toBe(true);
  });

  it('draws the title block on the top of the first page, with its images once they are known', () => {
    preview.show(template('page'), stylesheet);
    expect(elements.first.hidden).toBe(false);
    expect(elements.titleBlock.textContent).toBe('[assets/logo.png]First Author, Second Author');
    preview.setImages(new Map([['assets/logo.png', 'data:image/png;base64,iVA=']]));
    expect(elements.titleBlock.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,iVA=',
    );
  });

  it('is hidden for a template without a cover or title block, and for none', () => {
    preview.show(template('bare'), stylesheet);
    expect(elements.root.hidden).toBe(true);
    preview.show(template('page'), stylesheet);
    preview.show(undefined, stylesheet);
    expect(elements.root.hidden).toBe(true);
  });
});
