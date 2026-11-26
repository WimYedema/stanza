import { describe, expect, it } from 'vitest';
import { styleReferences } from './style-references.js';
import { validateStylesheet } from './style-validation.js';
import type { CoverGrid, HeaderFooter, PageTemplate } from './stylesheet.js';
import { n, sheet } from './stylesheet.testing.js';

const page = { kind: 'token', token: 'page', label: '1' } as const;
const grid = (rows: CoverGrid['rows']): CoverGrid => ({
  kind: 'grid',
  columns: [
    { kind: 'points', pt: 80 },
    { kind: 'share', fr: 1 },
  ],
  rows,
  areas: [['logo', 'text']],
  area: {
    text: { valign: 'top', content: [{ kind: 'paragraph', style: n('note'), text: [page] }] },
  },
});
const withHeader = (header: HeaderFooter): PageTemplate => ({
  size: 'A4',
  margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
  header,
});
const empty = { left: [], center: [], right: [] };
const plain = { text: {}, paragraph: {}, variants: {} };

describe('a header or a footer that is a grid (ADR 0095)', () => {
  const problems = (header: HeaderFooter) =>
    validateStylesheet(
      sheet({ paragraph: { note: plain }, pageTemplates: { page: withHeader(header) } }),
    ).map((d) => [d.code, d.path]);

  it('may show the page fields, which a cover may not', () => {
    expect(problems({ ...empty, distancePt: 20, grid: grid([{ kind: 'auto' }]) })).toEqual([]);
  });

  it('has rows that grow or have points, never a share, and a distance of 0 or more', () => {
    expect(problems({ ...empty, distancePt: -1, grid: grid([{ kind: 'share', fr: 1 }]) })).toEqual([
      ['invalid-value', 'page-templates.page.header.distance'],
      ['header-row-share', 'page-templates.page.header.rows[0]'],
    ]);
  });

  it('checks its areas and entries as those of a cover grid', () => {
    const bad: CoverGrid = {
      ...grid([{ kind: 'points', pt: 30 }]),
      areas: [['logo', 'logo', 'text']],
      area: { gone: { valign: 'top', content: [] } },
    };
    expect(problems({ ...empty, grid: bad })).toEqual([
      ['cover-areas-shape', 'page-templates.page.header.areas'],
      ['unknown-cover-area', 'page-templates.page.header.area.gone'],
    ]);
  });

  it('counts as a use of the styles of its entries', () => {
    const stylesheet = sheet({
      paragraph: { note: plain },
      pageTemplates: { page: withHeader({ ...empty, grid: grid([{ kind: 'auto' }]) }) },
    });
    expect(styleReferences(stylesheet, 'paragraph', n('note'))).toEqual([
      'The page template "page" uses it in its header.',
    ]);
  });
});
