import { describe, expect, it } from 'vitest';
import { coverOverflows } from './cover-fit.js';
import type { DocumentMeta } from './document.js';
import { validateDocument } from './document-validation.js';
import type { PageTemplate } from './stylesheet.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';

/** An A4 page whose cover has a title in a row of 40 pt and an abstract in one of 60 pt. */
const template: PageTemplate = {
  size: 'A4',
  margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
  cover: {
    kind: 'grid',
    columns: [{ kind: 'share', fr: 1 }],
    rows: [
      { kind: 'points', pt: 40 },
      { kind: 'points', pt: 60 },
      { kind: 'share', fr: 1 },
    ],
    areas: [['title'], ['abstract'], ['.']],
    area: {
      title: {
        valign: 'top',
        content: [
          {
            kind: 'paragraph',
            style: n('big'),
            text: [{ kind: 'token', token: 'title', label: '' }],
          },
        ],
      },
      abstract: {
        valign: 'top',
        content: [
          { kind: 'paragraph', text: [{ kind: 'field', name: 'abstract', label: 'Abstract' }] },
        ],
      },
    },
  },
};

const stylesheet = sheet({
  paragraph: {
    big: { ...plainStyle, text: { sizePt: 28 } },
    body: { ...plainStyle, text: { sizePt: 10 } },
  },
  pageTemplates: { page: template },
});

const meta = (title: string, abstract: string): DocumentMeta => ({
  title,
  fields: { abstract },
});

describe('coverOverflows (item 231)', () => {
  it('finds nothing when the text fits, as for short values', () => {
    expect(
      coverOverflows(template, meta('Annual review', 'A short abstract.'), stylesheet),
    ).toEqual([]);
  });

  it('finds an abstract that needs more lines than its row of fixed height holds', () => {
    // The text is 451 pt wide: 90 characters of 5 pt a line, and 12 pt a line, so 60 pt hold 5.
    const long = 'word '.repeat(150);
    expect(coverOverflows(template, meta('Annual review', long), stylesheet)).toEqual([
      { area: 'abstract', neededPt: 108, availablePt: 60, field: 'abstract' },
    ]);
  });

  it('finds a title of three lines in a row of one, and names its token', () => {
    const title = 'A title of a length that makes it wrap onto a second line at this size';
    expect(coverOverflows(template, meta(title, ''), stylesheet)).toEqual([
      { area: 'title', neededPt: 101, availablePt: 40, field: 'title' },
    ]);
  });

  it('leaves a row that grows alone, since it makes room', () => {
    if (template.cover?.kind !== 'grid') throw new Error('No grid.');
    const grows: PageTemplate = {
      ...template,
      cover: {
        ...template.cover,
        rows: [{ kind: 'auto' }, { kind: 'auto' }, { kind: 'share', fr: 1 }],
      },
    };
    expect(coverOverflows(grows, meta('x', 'word '.repeat(500)), stylesheet)).toEqual([]);
  });

  it('is a warning of the document, at the field to shorten', () => {
    const diagnostics = validateDocument(
      { meta: { title: 'Annual review', fields: { abstract: 'word '.repeat(150) } }, blocks: [] },
      stylesheet,
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'cover-text-too-long',
        path: 'abstract',
      }),
    ]);
  });
});
