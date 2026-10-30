import { describe, expect, it } from 'vitest';
import { validateDocument } from './document-validation.js';
import type { Document } from './document.js';
import { resolvePageTemplate } from './page-template.js';
import { applyDefaults, validateMetadata, type ProjectSettings } from './project.js';
import { validateStylesheet } from './style-validation.js';
import { BUILT_IN_PAGE_TEMPLATE, type PageTemplate, type Stylesheet } from './stylesheet.js';
import { sheet } from './stylesheet.testing.js';

const letter: PageTemplate = {
  size: 'Letter',
  margins: { topPt: 54, rightPt: 90, bottomPt: 54, leftPt: 90 },
};
const wide: PageTemplate = {
  size: 'A4',
  margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
};

describe('resolvePageTemplate', () => {
  it('uses the template called page, or the built-in page when there is none', () => {
    expect(resolvePageTemplate(sheet())).toBe(BUILT_IN_PAGE_TEMPLATE);
    expect(resolvePageTemplate(sheet({ pageTemplates: { page: letter } }))).toBe(letter);
  });

  it('lets a document ask for page by name even when the stylesheet declares none', () => {
    expect(resolvePageTemplate(sheet(), 'page')).toBe(BUILT_IN_PAGE_TEMPLATE);
  });

  it('finds a named template, and nothing for an unknown name', () => {
    const stylesheet = sheet({ pageTemplates: { 'page-letter': letter } });
    expect(resolvePageTemplate(stylesheet, 'page-letter')).toBe(letter);
    expect(resolvePageTemplate(stylesheet, 'other')).toBeUndefined();
    expect(resolvePageTemplate(stylesheet, 'Not A Name')).toBeUndefined();
  });
});

describe('validateStylesheet and page templates', () => {
  const problems = (stylesheet: Stylesheet) =>
    validateStylesheet(stylesheet).map((d) => [d.code, d.path]);

  it('accepts the built-in page and a Letter page', () => {
    expect(problems(sheet({ pageTemplates: { page: wide, 'page-letter': letter } }))).toEqual([]);
  });

  it('rejects a negative margin', () => {
    const template = { ...wide, margins: { ...wide.margins, leftPt: -1 } };
    expect(problems(sheet({ pageTemplates: { page: template } }))).toEqual([
      ['invalid-value', 'page-templates.page.margins.left'],
    ]);
  });

  it('rejects margins that leave no text area', () => {
    const tooWide = { ...wide, margins: { ...wide.margins, leftPt: 300, rightPt: 260 } };
    const tooHigh = { ...wide, margins: { ...wide.margins, topPt: 400, bottomPt: 400 } };
    expect(problems(sheet({ pageTemplates: { a: tooWide, b: tooHigh } }))).toEqual([
      ['invalid-value', 'page-templates.a.margins'],
      ['invalid-value', 'page-templates.b.margins'],
    ]);
  });

  it('rejects a header or footer style that is not a paragraph style', () => {
    const slots = { left: [], center: [], right: [] };
    const template = {
      ...wide,
      header: { ...slots, style: 'gone' as never },
      footer: { ...slots, style: 'body' as never },
    };
    expect(problems(sheet({ pageTemplates: { page: template } }))).toEqual([
      ['unknown-slot-style', 'page-templates.page.header.style'],
    ]);
  });

  it('rejects a size that is not supported', () => {
    const template = { ...wide, size: 'A3' } as unknown as PageTemplate;
    expect(problems(sheet({ pageTemplates: { page: template } }))).toEqual([
      ['invalid-value', 'page-templates.page.size'],
    ]);
  });
});

const settings = (pageTemplate?: string): ProjectSettings => ({
  stylesheet: 's.yaml',
  defaults: pageTemplate === undefined ? {} : { pageTemplate },
  fields: new Map([['reviewers', { type: 'list', required: false }]]),
});

describe('page-template as a field', () => {
  it('is filled in from the project default, and a document value wins', () => {
    const meta = { fields: {} };
    expect(applyDefaults(settings('page-letter'), meta).fields['page-template']).toBe(
      'page-letter',
    );
    expect(
      applyDefaults(settings('page-letter'), { fields: { 'page-template': 'page' } }).fields[
        'page-template'
      ],
    ).toBe('page');
    expect(applyDefaults(settings(), meta).fields).toEqual({});
  });

  it('is not reported as undeclared, since it is built in', () => {
    const meta = { fields: { 'page-template': 'page-letter', extra: 'x' } };
    expect(validateMetadata(meta, settings()).map((d) => [d.code, d.path])).toEqual([
      ['undeclared-field', 'extra'],
    ]);
  });

  const documentWith = (value: string | readonly string[]): Document => ({
    meta: { fields: { 'page-template': value } },
    blocks: [],
  });
  const stylesheet = sheet({ pageTemplates: { 'page-letter': letter } });
  const codes = (document: Document): string[] =>
    validateDocument(document, stylesheet).map((d) => d.code);

  it('is checked against the templates of the stylesheet', () => {
    expect(codes(documentWith('page-letter'))).toEqual([]);
    expect(codes(documentWith('page'))).toEqual([]);
    expect(codes(documentWith(''))).toEqual([]);
    expect(codes(documentWith('missing'))).toEqual(['unknown-page-template']);
    expect(codes(documentWith(['page-letter']))).toEqual(['field-type-mismatch']);
  });
});
