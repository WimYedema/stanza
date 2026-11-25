import type { Cover, CoverEntry, CoverRowHeight, PageMargins } from '@stanza/core';
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

/** The value of a `cover`: a list of entries (ADR 0019), or its margins and rows (ADR 0089). */
export function coverSource(cover: Cover): string {
  if (cover.kind === 'list') return entriesSource(cover.entries);
  const margins = cover.margins === undefined ? undefined : marginsText(cover.margins);
  const rows = cover.rows.flatMap((row) => {
    const height = heightText(row.height);
    const lines = [
      ...(height !== undefined ? [`height: ${height}`] : []),
      ...(row.valign !== 'top' ? [`valign: ${row.valign}`] : []),
      ...(row.content.length > 0 ? ['content:', ...indent(entriesLines(row.content), '  ')] : []),
    ];
    return item(lines.length > 0 ? lines : ['content: []']);
  });
  return [
    ...(margins !== undefined ? [`margins: ${margins}`] : []),
    ...(rows.length > 0 ? ['rows:', ...indent(rows, '  ')] : ['rows: []']),
  ].join('\n');
}
