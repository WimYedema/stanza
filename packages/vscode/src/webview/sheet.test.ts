// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAGE_SIZES } from '@stanza/core';
import { parseDocument, parseStylesheet } from '@stanza/format';
import { createSheet, sectionOf, sheetCss, templateOf, type Sheet } from './sheet.js';

const stylesheet = parseStylesheet(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../fixtures/example-project/styles/default.yaml',
    ),
    'utf8',
  ).replaceAll('\r\n', '\n'),
).stylesheet;

function documentOf(front: string, body = '# Introduction\n'): ReturnType<typeof parseDocument> {
  return parseDocument(`---\nstanza-format: 1\n${front}---\n\n${body}`);
}

const BODY = `<!-- stanza: #k7m2q9x4zb -->
# Introduction

Text.

<!-- stanza: #a1b2c3d4e5 -->
## Scope
`;

describe('sheetCss', () => {
  it('sizes the sheet and places the header and the footer, from the template', () => {
    const template = stylesheet.pageTemplates.get('page-letter' as never);
    if (template === undefined) throw new Error('No template.');
    const css = sheetCss(template);
    expect(css).toContain(`width: ${String(PAGE_SIZES.Letter.widthPt)}pt;`);
    expect(css).toContain('min-height: 792pt;');
    expect(css).toContain('padding: 54pt 90pt 54pt 90pt;');
    expect(css).toContain('#desk.paper .band { left: 90pt; right: 90pt; }');
    // The distance to the edge of Word, kept inside a small margin.
    expect(css).toContain('#desk.paper #header { top: 27pt; }');
  });

  it('keeps a header at 1.25 cm from the edge when the margin is large', () => {
    const css = sheetCss({
      size: 'A4',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
    });
    expect(css).toContain('#desk.paper #header { top: 35.4pt; }');
    expect(css).toContain('#desk.paper #footer { bottom: 35.4pt; }');
  });
});

describe('templateOf', () => {
  it('takes the template that the document names, and the default for none or an unknown one', () => {
    const named = documentOf('page-template: "page-letter"\n').document.meta;
    expect(templateOf(stylesheet, named).size).toBe('Letter');
    expect(templateOf(stylesheet, documentOf('').document.meta).size).toBe('A4');
    const unknown = documentOf('page-template: "nope"\n').document.meta;
    expect(templateOf(stylesheet, unknown).size).toBe('A4');
  });
});

describe('sectionOf', () => {
  it('is the first level 1 heading with its number', () => {
    expect(sectionOf(documentOf('', BODY).document, stylesheet)).toBe('1 Introduction');
  });

  it('is nothing without a level 1 heading', () => {
    expect(sectionOf(documentOf('', 'Only text.\n').document, stylesheet)).toBeUndefined();
  });
});

describe('createSheet', () => {
  let cover: HTMLElement;
  let header: HTMLElement;
  let footer: HTMLElement;
  let sheet: Sheet;

  beforeEach(() => {
    cover = document.createElement('div');
    header = document.createElement('div');
    footer = document.createElement('div');
    document.body.append(cover, header, footer);
    sheet = createSheet({ cover, header, footer });
  });
  afterEach(() => {
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  const show = (front: string, defaults = {}, body = BODY): void => {
    sheet.update({ stylesheet, defaults, document: documentOf(front, body).document });
  };
  const slots = (root: HTMLElement): string[] =>
    [...root.querySelectorAll('.slots > span')].map((slot) => slot.textContent);

  it('draws nothing until it knows the stylesheet, the defaults and the document', () => {
    sheet.update({ stylesheet });
    expect(header.childNodes).toHaveLength(0);
    expect(document.head.querySelector('style')?.textContent).toBe('');
  });

  it('writes the page geometry to a style element', () => {
    show('title: "T"\n');
    expect(document.head.querySelector('style')?.textContent).toContain('width: 595.3pt;');
  });

  it('fills the header from the metadata and the footer with the section and placeholders', () => {
    show('title: "My title"\nclassification: "Secret"\n');
    expect(header.hidden).toBe(false);
    expect(slots(header)).toEqual(['My title', '', 'Secret']);
    expect(slots(footer)).toEqual(['1 Introduction', '', 'Page 1 of 1']);
    expect(header.querySelector('.slots')?.className).toContain('stanza-p-header-footer');
    const fields = [...footer.querySelectorAll('.field')];
    expect(fields.map((field) => field.textContent)).toEqual(['1', '1']);
    expect(fields[0]?.getAttribute('title')).toContain('Word fills in');
  });

  it('takes the classification from the defaults of the project when the document has none', () => {
    show('title: "T"\n', { classification: 'Internal' });
    expect(slots(header)).toEqual(['T', '', 'Internal']);
  });

  it('follows the template that the document or the project selects', () => {
    show('title: "T"\n', { pageTemplate: 'page-letter' });
    expect(slots(header)[1]).toBe('Draft v?');
    expect(document.head.querySelector('style')?.textContent).toContain('width: 612pt;');
  });

  it('draws the cover from the metadata, with the classes of its styles, and leaves out empty parts', () => {
    show(
      'title: "My title"\nauthors:\n  - "A"\n  - "B"\nclassification: "Secret"\npage-template: "page-letter"\n',
    );
    expect(cover.hidden).toBe(false);
    const [title, authors] = [...cover.querySelectorAll('p')];
    expect(title?.className).toBe('stanza-p-cover-title');
    expect(title?.textContent).toBe('My title');
    expect(authors?.className).toBe('stanza-p-cover-meta');
    expect(authors?.textContent).toBe('A, B');
    const table = cover.querySelector('table');
    expect(table?.className).toBe('stanza-t-table-grid');
    // No document number or reviewers, so only the classification row is left.
    expect([...(table?.rows ?? [])].map((row) => row.textContent)).toEqual([
      'ClassificationSecret',
    ]);
    expect(table?.querySelector('td')?.className).toBe('stanza-p-table-cell');
  });

  it('draws a title block above the text, from the metadata, when the host has a place for it', () => {
    const withTitleBlock = parseStylesheet(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '../../../../fixtures/example-project/styles/default.yaml',
        ),
        'utf8',
      )
        .replaceAll('\r\n', '\n')
        .replace(
          '  page:\n',
          "  page:\n    title-block:\n      - { image: assets/logo.png }\n      - { style: cover-title, text: '[Untitled](stanza:title)' }\n",
        ),
    ).stylesheet;
    const titleBlock = document.createElement('div');
    document.body.append(titleBlock);
    const withPlace = createSheet({ cover, titleBlock, header, footer });
    const update = (front: string): void => {
      withPlace.update({
        stylesheet: withTitleBlock,
        defaults: {},
        document: documentOf(front, BODY).document,
      });
    };
    update('title: "My title"\n');
    expect(titleBlock.hidden).toBe(false);
    expect([...titleBlock.querySelectorAll('p')].map((p) => [p.className, p.textContent])).toEqual([
      ['stanza-p-body', '[assets/logo.png]'],
      ['stanza-p-cover-title', 'My title'],
    ]);
    expect(titleBlock.querySelector('.image-missing')?.getAttribute('title')).toContain('PNG');
    expect(cover.hidden).toBe(true);
    withPlace.update({ images: new Map([['assets/logo.png', 'data:image/png;base64,iVA=']]) });
    const picture = titleBlock.querySelector('img');
    expect(picture?.getAttribute('src')).toBe('data:image/png;base64,iVA=');
    expect(picture?.getAttribute('alt')).toBe('');
    expect(picture?.style.maxWidth).toBe('100%');
    expect(picture?.style.width).toBe('');
    update('title: "My title"\npage-template: "page-letter"\n');
    expect(titleBlock.hidden).toBe(true);
  });

  it('draws a cover of rows with their heights, alignment, margins and images', () => {
    const rows = [
      '  page-rows:',
      '    size: A4',
      '    margins: { top: 72, right: 72, bottom: 72, left: 72 }',
      '    cover:',
      '      margins: { top: 36, left: 48, right: 48 }',
      '      rows:',
      '        - height: 100',
      '          content:',
      '            - { image: assets/logo.png, width: 150, style: cover-meta }',
      '        - height: 2fr',
      '          valign: bottom',
      '          content:',
      "            - { style: cover-title, text: '[Untitled](stanza:title)' }",
      '        - height: 1fr',
      '',
    ].join('\n');
    const text = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../fixtures/example-project/styles/default.yaml',
      ),
      'utf8',
    ).replaceAll('\r\n', '\n');
    const at = text.indexOf('\ntable-of-contents:');
    const withRows = parseStylesheet(`${text.slice(0, at)}\n${rows}${text.slice(at)}`).stylesheet;
    sheet.update({
      stylesheet: withRows,
      defaults: {},
      document: documentOf('title: "My title"\npage-template: "page-rows"\n', BODY).document,
      images: new Map([['assets/logo.png', 'data:image/png;base64,iVA=']]),
    });
    expect(cover.hidden).toBe(false);
    expect(cover.style.padding).toBe('36pt 48pt 72pt');
    const drawn = [...cover.querySelectorAll<HTMLElement>('.cover-row')];
    // 733.9 pt between the margins, less 2 pt for the end of the section and the 100 pt row.
    expect(drawn.map((row) => row.style.height)).toEqual(['100pt', '421.267pt', '210.633pt']);
    expect(drawn.map((row) => row.style.justifyContent)).toEqual([
      'flex-start',
      'flex-end',
      'flex-start',
    ]);
    expect(drawn[0]?.style.overflow).toBe('hidden');
    expect(drawn[0]?.querySelector('img')?.style.width).toBe('150pt');
    expect(drawn[1]?.textContent).toBe('My title');
    expect(drawn[2]?.childNodes).toHaveLength(0);
  });

  it('has no cover for a template without one, and hides a header with nothing in it', () => {
    show('title: "T"\n');
    expect(cover.hidden).toBe(true);
    expect(cover.childNodes).toHaveLength(0);
    show('title: "T"\n', {}, 'Text.\n');
    expect(slots(footer)[0]).toBe('');
  });

  it('shows the text of a title as text and not as markup', () => {
    show('title: "<b>x</b>"\n');
    expect(header.querySelector('b')).toBeNull();
    expect(slots(header)[0]).toBe('<b>x</b>');
  });

  it('follows a change of the document, as for the section', () => {
    show('title: "T"\n');
    sheet.update({ document: documentOf('title: "T"\n', '# Changed\n').document });
    expect(slots(footer)[0]).toBe('1 Changed');
  });
});
