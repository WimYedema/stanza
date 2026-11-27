import type {
  ColorValue,
  Cover,
  CoverEntry,
  CoverGrid,
  CoverRowHeight,
  HeaderFooter,
  PageMargins,
} from '@stanza/core';
import { slotSource } from './slot-source.js';

/**
 * The text of a cover or a title block as the style editor writes it (ADR 0091): block YAML with two
 * spaces of indentation and keys in a fixed order, which `readCover` and `readEntries` of the
 * stylesheet read back to the same model. It is the value of the property, without its key.
 */

/** Text in single quotes, as the stylesheet writes text that is not a plain word. */
const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;

const indent = (lines: readonly string[], by: string): string[] =>
  lines.map((line) => (line === '' ? line : `${by}${line}`));

/** A list item of several lines: the first behind `- `, the others in line with it. */
const item = (lines: readonly string[]): string[] =>
  lines.map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`));

function entryLines(entry: CoverEntry): string[] {
  switch (entry.kind) {
    case 'paragraph':
      return [
        ...(entry.style !== undefined ? [`style: ${entry.style}`] : []),
        `text: ${quoted(slotSource(entry.text))}`,
      ];
    case 'image':
      return [
        `image: ${quoted(entry.path)}`,
        ...(entry.widthPt !== undefined ? [`width: ${String(entry.widthPt)}`] : []),
        ...(entry.style !== undefined ? [`style: ${entry.style}`] : []),
      ];
    case 'table':
      return [
        'table:',
        `  style: ${entry.style}`,
        ...(entry.rows.length === 0
          ? ['  rows: []']
          : [
              '  rows:',
              ...indent(
                entry.rows.flatMap((row) =>
                  item([`label: ${quoted(row.label)}`, `value: ${quoted(slotSource(row.value))}`]),
                ),
                '    ',
              ),
            ]),
      ];
  }
}

/** The lines of a list of entries, `[]` when there are none. */
function entriesLines(entries: readonly CoverEntry[]): string[] {
  return entries.flatMap((entry) => item(entryLines(entry)));
}

/** A color token by its name; a raw color, which ADR 0065 reports, in quotes. */
const colorText = (color: ColorValue): string =>
  color.kind === 'token' ? color.name : quoted(color.hex);

const heightText = (height: CoverRowHeight): string | undefined => {
  if (height.kind === 'points') return String(height.pt);
  if (height.kind === 'share') return `${String(height.fr)}fr`;
  return undefined;
};

function marginsText(margins: Partial<PageMargins>): string | undefined {
  const sides = [
    ['top', margins.topPt],
    ['right', margins.rightPt],
    ['bottom', margins.bottomPt],
    ['left', margins.leftPt],
  ] as const;
  const given = sides.filter(([, value]) => value !== undefined);
  if (given.length === 0) return undefined;
  return `{ ${given.map(([side, value]) => `${side}: ${String(value)}`).join(', ')} }`;
}

/** The value of a `title-block`: a list of entries, written as a block list. */
export function entriesSource(entries: readonly CoverEntry[]): string {
  return entries.length === 0 ? '[]' : entriesLines(entries).join('\n');
}

/** A size in a list, such as `120` or `'2fr'`, and `auto` for a row that grows. */
const sizeText = (size: CoverRowHeight): string =>
  size.kind === 'points'
    ? String(size.pt)
    : size.kind === 'share'
      ? `${String(size.fr)}fr`
      : 'auto';

/** The lines of a grid (ADR 0092), with the names of each line of areas lined up in columns. */
function gridLines(cover: CoverGrid, margins: string | undefined): string[] {
  const widths = cover.areas.reduce<number[]>((max, line) => {
    line.forEach((name, column) => {
      max[column] = Math.max(max[column] ?? 0, name.length);
    });
    return max;
  }, []);
  const areaLines = cover.areas.map((line) =>
    line
      .map((name, column) => (column === line.length - 1 ? name : name.padEnd(widths[column] ?? 0)))
      .join(' '),
  );
  const areas = Object.entries(cover.area).flatMap(([name, area]) => {
    const lines = [
      ...(area.valign !== 'top' ? [`valign: ${area.valign}`] : []),
      ...(area.background !== undefined ? [`background: ${colorText(area.background)}`] : []),
      ...(area.content.length > 0
        ? ['content:', ...indent(entriesLines(area.content), '  ')]
        : ['content: []']),
    ];
    return [`${name}:`, ...indent(lines, '  ')];
  });
  return [
    ...(margins !== undefined ? [`margins: ${margins}`] : []),
    ...(cover.backgroundImage !== undefined
      ? [`background-image: ${quoted(cover.backgroundImage)}`]
      : []),
    `columns: [${cover.columns.map(sizeText).join(', ')}]`,
    `rows: [${cover.rows.map(sizeText).join(', ')}]`,
    ...(areaLines.length > 0
      ? ['areas:', ...areaLines.map((line) => `  - ${quoted(line)}`)]
      : ['areas: []']),
    ...(areas.length > 0 ? ['area:', ...indent(areas, '  ')] : []),
  ];
}

/**
 * The value of a `cover`: a list of entries (ADR 0019), its margins and rows (ADR 0089), or its
 * margins and grid (ADR 0092).
 */
export function coverSource(cover: Cover): string {
  if (cover.kind === 'list') return entriesSource(cover.entries);
  const margins = cover.margins === undefined ? undefined : marginsText(cover.margins);
  if (cover.kind === 'grid') return gridLines(cover, margins).join('\n');
  const rows = cover.rows.flatMap((row) => {
    const height = heightText(row.height);
    const lines = [
      ...(height !== undefined ? [`height: ${height}`] : []),
      ...(row.valign !== 'top' ? [`valign: ${row.valign}`] : []),
      ...(row.background !== undefined ? [`background: ${colorText(row.background)}`] : []),
      ...(row.content.length > 0 ? ['content:', ...indent(entriesLines(row.content), '  ')] : []),
    ];
    return item(lines.length > 0 ? lines : ['content: []']);
  });
  return [
    ...(margins !== undefined ? [`margins: ${margins}`] : []),
    ...(cover.backgroundImage !== undefined
      ? [`background-image: ${quoted(cover.backgroundImage)}`]
      : []),
    ...(rows.length > 0 ? ['rows:', ...indent(rows, '  ')] : ['rows: []']),
  ].join('\n');
}

/**
 * The value of a `header` or `footer` (ADR 0017, ADR 0095): its style and its distance, then its
 * grid, or the slots that have text.
 */
export function headerFooterSource(band: HeaderFooter): string {
  const slots = (['left', 'center', 'right'] as const).flatMap((slot) =>
    band[slot].length > 0 ? [`${slot}: ${quoted(slotSource(band[slot]))}`] : [],
  );
  return [
    ...(band.style !== undefined ? [`style: ${band.style}`] : []),
    ...(band.distancePt !== undefined ? [`distance: ${String(band.distancePt)}`] : []),
    ...(band.grid !== undefined ? gridLines(band.grid, undefined) : slots),
  ].join('\n');
}
