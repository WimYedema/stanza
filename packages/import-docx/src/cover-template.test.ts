import { beforeAll, describe, expect, it } from 'vitest';
import { importCoverTemplate, type CoverTemplateImport } from './cover-template.js';
import { reportTemplate } from './cover-template.testing.js';

let imported: CoverTemplateImport;

beforeAll(async () => {
  const result = importCoverTemplate(await reportTemplate(), {
    name: 'test',
    assetsDirectory: 'assets/test',
    colors: new Map([['blue', '#336699']]),
    fonts: new Map(),
  });
  if (!result.ok) throw new Error(result.message);
  imported = result.result;
});

/** The entries of the areas in the order of the rows, by kind and text. */
const contents = () =>
  imported.cover.areas
    .flat()
    .filter((name, index, all) => name !== '.' && all.indexOf(name) === index)
    .map((name) => imported.cover.area[name]);

describe('importCoverTemplate (ADR 0094)', () => {
  it('takes the page of the template', () => {
    expect(imported.size).toBe('A4');
    expect(imported.margins).toEqual({ topPt: 56.7, rightPt: 56.7, bottomPt: 56.7, leftPt: 93.55 });
    expect(imported.cover.margins).toEqual({ topPt: 28.35, bottomPt: 28.35 });
  });

  it('makes columns of the table without borders in the first-page header, with the logo beside the address', () => {
    expect(imported.cover.columns).toEqual([
      { kind: 'points', pt: 225 },
      { kind: 'share', fr: 1 },
    ]);
    const [logo, address] = imported.cover.areas[0] ?? [];
    expect(imported.cover.area[logo ?? '']?.content).toEqual([
      { kind: 'image', path: 'assets/test/image-1.png', widthPt: 72, style: 'test-base' },
    ]);
    expect(
      imported.cover.area[address ?? '']?.content.map((entry) =>
        entry.kind === 'paragraph' ? entry.text : undefined,
      ),
    ).toEqual([[{ kind: 'text', text: 'Example Org' }], [{ kind: 'text', text: '1 Main Street' }]]);
    expect(imported.images.map((image) => image.path)).toEqual(['assets/test/image-1.png']);
  });

  it('makes a paragraph border a rule, with the token of its color', () => {
    const rule = contents().find((area) => area?.background !== undefined);
    expect(rule).toEqual({
      valign: 'top',
      background: { kind: 'token', name: 'blue' },
      content: [],
    });
    expect(imported.colors.map(([, hex]) => hex)).not.toContain('#336699');
  });

  it('puts a framed paragraph at its place on the page', () => {
    const rows = imported.cover.rows.map((row) => (row.kind === 'points' ? row.pt : 0));
    const index = imported.cover.areas.findIndex((line) =>
      line.some((name) => {
        const entry = imported.cover.area[name]?.content[0];
        return (
          entry?.kind === 'paragraph' &&
          entry.text[0]?.kind === 'text' &&
          entry.text[0].text === 'Technical report'
        );
      }),
    );
    // The frame is 226.85 pt from the top of the page; the cover starts 28.35 pt down.
    const top = 28.35 + rows.slice(0, index).reduce((sum, value) => sum + value, 0);
    expect(Math.abs(top - 226.85)).toBeLessThan(1);
  });

  it('makes placeholders tokens and fields, with their text as label', () => {
    const title = contents().find(
      (area) => area?.content[0]?.kind === 'paragraph' && area.content[0].style === 'test-doctitle',
    );
    expect(title?.content[0]).toEqual({
      kind: 'paragraph',
      style: 'test-doctitle',
      text: [{ kind: 'token', token: 'title', label: 'Document title' }],
    });
    expect(imported.fields).toEqual(['date', 'document-number']);
  });

  it('makes a table with borders a cover table of labels and values, joining extra cells', () => {
    const table = contents().find((area) => area?.content[0]?.kind === 'table')?.content[0];
    expect(table).toEqual({
      kind: 'table',
      style: 'test-table',
      rows: [
        {
          label: 'Author(s):',
          value: [{ kind: 'token', token: 'authors', label: 'Author name(s)' }],
        },
        {
          label: 'Date:',
          value: [
            { kind: 'field', name: 'date', label: 'Date' },
            { kind: 'text', text: ' ' },
            { kind: 'text', text: 'Doc. No:' },
            { kind: 'text', text: ' ' },
            { kind: 'field', name: 'document-number', label: 'Document number' },
          ],
        },
      ],
    });
    expect(imported.tableStyles[0]?.cellStyle).toBe('test-meta');
    expect(imported.approximated).toContain(
      'A table row with more than two cells is one label and one value, the other cells joined.',
    );
  });

  it('reads the look of the styles, and centres a line that a tab puts at a centre stop', () => {
    const byName = new Map(imported.paragraphStyles.map((style) => [style.name, style]));
    expect(byName.get('test-doctitle')).toMatchObject({
      sizePt: 18,
      bold: true,
      alignment: 'center',
      color: 'test-color-1',
    });
    // The borders of the table have no color of their own, so they are black.
    expect(imported.colors).toEqual([
      ['test-color-1', '#AA3300'],
      ['test-color-2', '#000000'],
    ]);
    expect(imported.fonts).toEqual([['test-font-1', ['Example Sans']]]);
    expect(byName.get('test-footline')).toMatchObject({ sizePt: 11, alignment: 'center' });
    const footer = contents().at(-1)?.content[0];
    expect(footer).toEqual({
      kind: 'paragraph',
      style: 'test-footline',
      text: [{ kind: 'text', text: 'Restricted use' }],
    });
  });

  it('fills the page: a share row before the footer, and the rest in points', () => {
    const kinds = imported.cover.rows.map((row) => row.kind);
    expect(kinds.filter((kind) => kind === 'share')).toHaveLength(1);
    expect(kinds.at(-2)).toBe('share');
    expect(kinds).not.toContain('auto');
  });

  it('refuses what is not a Word file', () => {
    const result = importCoverTemplate(new Uint8Array([1, 2, 3]), {
      name: 'x',
      assetsDirectory: 'assets/x',
      colors: new Map(),
      fonts: new Map(),
    });
    expect(result.ok).toBe(false);
  });

  it('makes the header of the body pages a grid: the logo, the title and the date in their columns (ADR 0095)', () => {
    const header = imported.header;
    expect(header?.distancePt).toBe(28.35);
    expect(header?.grid?.columns).toEqual([
      { kind: 'points', pt: 111.3 },
      { kind: 'points', pt: 222.5 },
      { kind: 'share', fr: 1 },
    ]);
    expect(header?.grid?.rows).toEqual([{ kind: 'auto' }]);
    const [logo, title, date] = (header?.grid?.areas[0] ?? []).map(
      (name) => header?.grid?.area[name]?.content,
    );
    expect(logo).toEqual([
      { kind: 'image', path: 'assets/test/image-1.png', widthPt: 48, style: 'test-meta' },
    ]);
    expect(title).toEqual([
      {
        kind: 'paragraph',
        style: 'test-meta-2',
        text: [
          { kind: 'token', token: 'title', label: 'Title' },
          { kind: 'text', text: ' \u2013 rev. ' },
          { kind: 'token', token: 'version', label: '' },
        ],
      },
    ]);
    expect(date).toEqual([
      {
        kind: 'paragraph',
        style: 'test-meta-3',
        text: [{ kind: 'field', name: 'date', label: 'Date' }],
      },
    ]);
    const styles = new Map(imported.paragraphStyles.map((style) => [style.name, style]));
    expect(styles.get('test-meta-2')?.alignment).toBe('center');
    expect(styles.get('test-meta-3')?.alignment).toBe('right');
    expect(imported.approximated).toContain(
      'The REVNUM field, which counts the saves of a file, is the version token (ADR 0095).',
    );
  });

  it('makes the footer of the body pages a grid with the page fields as tokens (ADR 0095)', () => {
    const footer = imported.footer;
    expect(footer?.distancePt).toBe(28.35);
    const name = footer?.grid?.areas[0]?.[0] ?? '';
    expect(footer?.grid?.area[name]?.content).toEqual([
      {
        kind: 'paragraph',
        style: 'test-meta',
        text: [
          { kind: 'token', token: 'page', label: '1' },
          { kind: 'text', text: ' / ' },
          { kind: 'token', token: 'pages', label: '1' },
        ],
      },
    ]);
  });
});
