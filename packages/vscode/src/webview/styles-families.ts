import type { Stylesheet } from '@phrase/core';

/**
 * The families of the style editor (ADR 0036): the tabs, and what each one lists. The styles of the
 * file are sorted into families by what they are and by the names that the model reserves.
 */

export type Family =
  'paragraphs' | 'headings' | 'lists' | 'tables' | 'characters' | 'pages' | 'theme';

export const FAMILIES: readonly { readonly id: Family; readonly title: string }[] = [
  { id: 'paragraphs', title: 'Paragraphs' },
  { id: 'headings', title: 'Headings' },
  { id: 'lists', title: 'Lists' },
  { id: 'tables', title: 'Tables' },
  { id: 'characters', title: 'Character styles' },
  { id: 'pages', title: 'Pages' },
  { id: 'theme', title: 'Theme' },
];

export type EntryKind =
  'paragraph-style' | 'character-style' | 'table-style' | 'page-template' | 'color' | 'font';

/** One line of a tab: a style, a page template or a token. */
export interface Entry {
  readonly family: Family;
  readonly kind: EntryKind;
  /** The name in the file, which documents and the file itself use. */
  readonly name: string;
  /** What people see in place of the name (ADR 0034). */
  readonly label: string | undefined;
  readonly basedOn: string | undefined;
}

/** What a person reads for an entry: its label, or else its name. */
export const displayName = (entry: Entry): string => entry.label ?? entry.name;

const HEADING = /^heading-[1-6]$/;
const LIST = /^list-(bulleted|numbered)$/;

function paragraphFamily(name: string): Family {
  if (HEADING.test(name)) return 'headings';
  return LIST.test(name) ? 'lists' : 'paragraphs';
}

/** Every entry of the stylesheet, in the order of the file, with the family it is shown under. */
export function entriesOf(stylesheet: Stylesheet): readonly Entry[] {
  const entries: Entry[] = [];
  for (const [name, style] of stylesheet.paragraphStyles) {
    entries.push({
      family: paragraphFamily(name),
      kind: 'paragraph-style',
      name,
      label: style.label,
      basedOn: style.basedOn,
    });
  }
  for (const [name, style] of stylesheet.tableStyles) {
    entries.push({
      family: 'tables',
      kind: 'table-style',
      name,
      label: style.label,
      basedOn: style.basedOn,
    });
  }
  for (const [name, style] of stylesheet.characterStyles) {
    entries.push({
      family: 'characters',
      kind: 'character-style',
      name,
      label: style.label,
      basedOn: style.basedOn,
    });
  }
  for (const name of stylesheet.pageTemplates.keys()) {
    entries.push({
      family: 'pages',
      kind: 'page-template',
      name,
      label: undefined,
      basedOn: undefined,
    });
  }
  for (const name of stylesheet.tokens.colors.keys()) {
    entries.push({ family: 'theme', kind: 'color', name, label: undefined, basedOn: undefined });
  }
  for (const name of stylesheet.tokens.fonts.keys()) {
    entries.push({ family: 'theme', kind: 'font', name, label: undefined, basedOn: undefined });
  }
  return entries;
}

/** What the stylesheet says about an entry, as terms and what they mean, for the detail. */
export function describeEntry(
  entry: Entry,
  stylesheet: Stylesheet,
): readonly (readonly [string, string])[] {
  const lines: [string, string][] = [['Name', entry.name]];
  switch (entry.kind) {
    case 'paragraph-style':
    case 'character-style':
    case 'table-style':
      if (entry.label !== undefined) lines.push(['Label', entry.label]);
      lines.push(['Based on', entry.basedOn ?? 'nothing']);
      break;
    case 'page-template': {
      const template = [...stylesheet.pageTemplates].find(([name]) => name === entry.name)?.[1];
      if (template === undefined) break;
      const { topPt, rightPt, bottomPt, leftPt } = template.margins;
      lines.push(
        ['Size', template.size],
        [
          'Margins',
          `${String(topPt)}, ${String(rightPt)}, ${String(bottomPt)}, ${String(leftPt)} pt`,
        ],
        ['Header', template.header === undefined ? 'none' : 'yes'],
        ['Footer', template.footer === undefined ? 'none' : 'yes'],
        ['Cover', template.cover === undefined ? 'none' : 'yes'],
      );
      break;
    }
    case 'color':
      lines.push(['Value', stylesheet.tokens.colors.get(entry.name) ?? '']);
      break;
    case 'font':
      lines.push(['Families', (stylesheet.tokens.fonts.get(entry.name) ?? []).join(', ')]);
      break;
  }
  return lines;
}
