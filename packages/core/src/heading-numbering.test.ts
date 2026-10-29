import { describe, expect, it } from 'vitest';
import { validateDocument } from './document-validation.js';
import type { Block, Document, Heading, HeadingLevel } from './document.js';
import { numberHeadings } from './heading-numbering.js';
import { n, plainStyle, sheet } from './stylesheet.testing.js';
import type { StyleName } from './style-name.js';
import type { ParagraphStyle } from './stylesheet.js';

const heading = (level: HeadingLevel, style?: StyleName): Heading => ({
  type: 'heading',
  level,
  content: [{ type: 'text', text: 'H', marks: [] }],
  ...(style !== undefined ? { style } : {}),
});
const paragraph = (style?: StyleName): Block => ({
  type: 'paragraph',
  content: [{ type: 'text', text: 'P', marks: [] }],
  ...(style !== undefined ? { style } : {}),
});
const documentOf = (...blocks: Block[]): Document => ({ meta: { fields: {} }, blocks });

const numbered = (value: boolean): ParagraphStyle => ({
  ...plainStyle,
  paragraph: { numbered: value },
});

/** Levels 1 to 3 are numbered, deeper levels are not, and `plain-heading` opts out. */
const stylesheet = sheet({
  paragraph: {
    'heading-1': numbered(true),
    'heading-2': { ...plainStyle, basedOn: n('heading-1') },
    'heading-3': { ...plainStyle, basedOn: n('heading-2') },
    'heading-4': { ...plainStyle, basedOn: n('heading-3'), paragraph: { numbered: false } },
    'plain-heading': { ...plainStyle, basedOn: n('heading-1'), paragraph: { numbered: false } },
  },
});

describe('numberHeadings', () => {
  it('numbers headings hierarchically', () => {
    const result = numberHeadings(
      documentOf(heading(1), heading(2), heading(2), heading(3), heading(1), heading(2)),
      stylesheet,
    );
    expect(result.labels).toEqual(['1', '1.1', '1.2', '1.2.1', '2', '2.1']);
    expect(result.diagnostics).toEqual([]);
  });

  it('gives no number to blocks that are not numbered headings', () => {
    const result = numberHeadings(
      documentOf(heading(1), paragraph(), heading(4), heading(1, n('plain-heading')), heading(1)),
      stylesheet,
    );
    expect(result.labels).toEqual(['1', undefined, undefined, undefined, '2']);
  });

  it('does not let an unnumbered heading change the counters', () => {
    const result = numberHeadings(
      documentOf(heading(1), heading(2), heading(1, n('plain-heading')), heading(2)),
      stylesheet,
    );
    expect(result.labels).toEqual(['1', '1.1', undefined, '1.2']);
  });

  it('counts a skipped level as 0 and warns', () => {
    const result = numberHeadings(documentOf(heading(1), heading(3)), stylesheet);
    expect(result.labels).toEqual(['1', '1.0.1']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'heading-level-skipped',
        path: 'blocks[1]',
      }),
    ]);
  });

  it('continues from the given counters and returns the final ones', () => {
    const result = numberHeadings(documentOf(heading(1), heading(2)), stylesheet, [3, 4]);
    expect(result.labels).toEqual(['4', '4.1']);
    expect(result.counters).toEqual([4, 1, 0, 0, 0, 0]);
  });

  it('treats a heading whose style cannot be resolved as unnumbered', () => {
    const result = numberHeadings(documentOf(heading(1, n('missing'))), stylesheet);
    expect(result.labels).toEqual([undefined]);
  });
});

describe('validateDocument and numbering', () => {
  const codes = (document: Document): string[] =>
    validateDocument(document, stylesheet).map((d) => d.code);

  it('includes the heading number warnings', () => {
    expect(codes(documentOf(heading(2)))).toContain('heading-level-skipped');
  });

  it('warns when a numbered style is used by a block that is not a heading', () => {
    expect(codes(documentOf(paragraph(n('heading-1'))))).toContain('numbering-not-applicable');
    expect(codes(documentOf(paragraph()))).not.toContain('numbering-not-applicable');
  });
});
