import { beforeAll, describe, expect, it } from 'vitest';
import type { CoverColumnWidth, CoverRowHeight } from '@stanza/core';
import { importCoverTemplate, type CoverTemplateImport } from './cover-template.js';
import { shapedTemplate } from './cover-template.testing.js';

let imported: CoverTemplateImport;

beforeAll(() => {
  const result = importCoverTemplate(shapedTemplate(), {
    name: 'test',
    assetsDirectory: 'assets/test',
    colors: new Map(),
    fonts: new Map(),
  });
  if (!result.ok) throw new Error(result.message);
  imported = result.result;
});

/** The color of a token of the import. */
const hex = (token: string | undefined): string | undefined =>
  imported.colors.find(([name]) => name === token)?.[1];

/** The top, left, bottom and right edges of an area in points, from the columns and rows. */
function edges(name: string): { top: number; left: number; bottom: number; right: number } {
  const { cover } = imported;
  // The import writes one share among points, so the share is what the points leave.
  const size = (sizes: readonly (CoverColumnWidth | CoverRowHeight)[], total: number): number[] => {
    const fixed = sizes.reduce((sum, s) => sum + (s.kind === 'points' ? s.pt : 0), 0);
    return sizes.map((s) => (s.kind === 'points' ? s.pt : total - fixed));
  };
  const widths = size(cover.columns, 595.3);
  const heights = size(cover.rows, 841.9);
  const rows = cover.areas.flatMap((line, row) => (line.includes(name) ? [row] : []));
  const columns = (cover.areas[rows[0] ?? 0] ?? []).flatMap((n, column) =>
    n === name ? [column] : [],
  );
  const sum = (list: number[], to: number): number =>
    list.slice(0, to).reduce((total, value) => total + value, 0);
  return {
    top: sum(heights, rows[0] ?? 0),
    bottom: sum(heights, (rows.at(-1) ?? 0) + 1),
    left: sum(widths, columns[0] ?? 0),
    right: sum(widths, (columns.at(-1) ?? 0) + 1),
  };
}

describe('importCoverTemplate with shapes anchored to the page (ADR 0098)', () => {
  it('lays the shapes out as one grid over the whole page', () => {
    expect(imported.cover.margins).toEqual({ topPt: 0, rightPt: 0, bottomPt: 0, leftPt: 0 });
    expect(imported.converted).toContain(
      '4 shapes anchored to the page, laid out with the rest as one grid over the whole page.',
    );
  });

  it('makes a picture behind the whole page the background image of the cover (ADR 0097)', () => {
    expect(imported.cover.backgroundImage).toBe('assets/test/image-1.png');
    expect(imported.images.map((image) => image.path)).toEqual(['assets/test/image-1.png']);
  });

  it('takes a group apart: the text box sits on the band, and takes its color', () => {
    const title = imported.cover.area['title'];
    expect(title?.content).toEqual([
      expect.objectContaining({
        kind: 'paragraph',
        text: [{ kind: 'token', token: 'title', label: 'Title' }],
      }),
    ]);
    expect(title?.valign).toBe('center');
    expect(title?.background?.kind === 'token' && hex(title.background.name)).toBe('#1F3864');
    // The text box is 10% to 90% across the band of 200 pt, and 50% to 80% down it.
    const at = edges('title');
    expect(Math.abs(at.left - 59.5)).toBeLessThan(1);
    expect(Math.abs(at.right - 535.8)).toBeLessThan(1);
    expect(Math.abs(at.top - 100)).toBeLessThan(1);
    expect(Math.abs(at.bottom - 160)).toBeLessThan(1);
  });

  it('keeps what is left of the band as areas of its color around the text box', () => {
    const bands = Object.entries(imported.cover.area).filter(([name]) => name.startsWith('band-'));
    expect(bands.length).toBeGreaterThanOrEqual(3);
    for (const [, area] of bands) {
      expect(area.background?.kind === 'token' && hex(area.background.name)).toBe('#1F3864');
    }
    const covered = bands.map(([name]) => edges(name)).filter((at) => at.bottom <= 200.5);
    expect(covered).toHaveLength(bands.length);
  });

  it('places a box by a percentage of the page, inside the content Word keeps for new readers', () => {
    const name = Object.entries(imported.cover.area).find(([, area]) =>
      area.content.some(
        (entry) =>
          entry.kind === 'paragraph' &&
          entry.text.some((part) => part.kind === 'text' && part.text === 'Example Org'),
      ),
    )?.[0];
    if (name === undefined) throw new Error('No box.');
    const at = edges(name);
    expect(Math.abs(at.left - 297.65)).toBeLessThan(1);
    expect(Math.abs(at.top - 600)).toBeLessThan(1);
    // Accent 1 at half its luminance.
    const background = imported.cover.area[name]?.background;
    expect(background?.kind === 'token' && hex(background.name)).toBe('#203864');
  });

  it('reports a shape that is not a rectangle and leaves it out', () => {
    expect(imported.leftOut).toContain('A shape of the form "ellipse" is left out.');
    const red = imported.colors.find(([, value]) => value === '#FF0000');
    expect(red).toBeUndefined();
  });
});
