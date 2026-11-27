import { setBlock, setProperty, type StylesheetEdit } from './edit-stylesheet.js';
import { parseStylesheet } from './stylesheet.js';

/**
 * Covers to start from (ADR 0100): each is the text of a cover, with the paragraph styles, table
 * style and color tokens it uses. Applying one writes the cover into a page template and adds what
 * it uses that the stylesheet does not have; what the stylesheet has under the same name stays as
 * it is. After that the cover is ordinary stylesheet text: nothing refers to the preset.
 */

export interface CoverPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** The metadata fields it shows, which the project declares to fill them. */
  readonly fields: readonly string[];
  /** Color tokens by name, as six hex digits with `#`. */
  readonly colors: Readonly<Record<string, string>>;
  /** Paragraph styles by name, as YAML lines, in an order in which each base comes first. */
  readonly paragraphStyles: readonly (readonly [string, string])[];
  readonly tableStyles: readonly (readonly [string, string])[];
  /** The value of `cover`, as YAML lines. */
  readonly cover: string;
}

const lines = (...text: readonly string[]): string => text.join('\n');

const COLORS = {
  'cover-accent': '#1F4E79',
  'cover-deep': '#0F2A3F',
  'cover-muted': '#5F6B7A',
  'cover-light': '#FFFFFF',
};

const TITLE: readonly [string, string] = [
  'cover-title',
  lines(
    'based-on: body',
    'size: 30',
    'bold: true',
    'color: cover-accent',
    'space-after: 8',
    'line-spacing: { multiple: 1 }',
  ),
];
const SUBTITLE: readonly [string, string] = [
  'cover-subtitle',
  lines('based-on: body', 'size: 15', 'color: cover-muted', 'space-after: 0'),
];
const META: readonly [string, string] = [
  'cover-meta',
  lines('based-on: body', 'size: 11', 'color: cover-muted', 'space-after: 2'),
];
const centred = (name: string, base: string): readonly [string, string] => [
  name,
  lines(`based-on: ${base}`, 'alignment: center'),
];
const light = (name: string, base: string): readonly [string, string] => [
  name,
  lines(`based-on: ${base}`, 'color: cover-light'),
];

export const COVER_PRESETS: readonly CoverPreset[] = [
  {
    id: 'classic',
    label: 'Classic, centred',
    description:
      'The title a third of the way down, the authors in the middle, the date at the bottom; all centred.',
    fields: ['subtitle', 'date'],
    colors: COLORS,
    paragraphStyles: [
      TITLE,
      SUBTITLE,
      META,
      centred('cover-title-centre', 'cover-title'),
      centred('cover-subtitle-centre', 'cover-subtitle'),
      centred('cover-meta-centre', 'cover-meta'),
    ],
    tableStyles: [],
    cover: lines(
      'rows:',
      '  - height: 1fr',
      '  - height: 2fr',
      '    content:',
      '      - style: cover-title-centre',
      "        text: '[Untitled](stanza:title)'",
      '      - style: cover-subtitle-centre',
      "        text: '[](stanza:field:subtitle)'",
      '  - height: 2fr',
      '    content:',
      '      - style: cover-meta-centre',
      "        text: '[](stanza:authors)'",
      '  - height: 1fr',
      '    valign: bottom',
      '    content:',
      '      - style: cover-meta-centre',
      "        text: '[](stanza:field:date)'",
    ),
  },
  {
    id: 'lower-third',
    label: 'Title in the lower third',
    description:
      'Empty space above, the title and subtitle low on the page, the authors and date below them.',
    fields: ['subtitle', 'date'],
    colors: COLORS,
    paragraphStyles: [TITLE, SUBTITLE, META],
    tableStyles: [],
    cover: lines(
      'rows:',
      '  - height: 3fr',
      '    valign: bottom',
      '    content:',
      '      - style: cover-title',
      "        text: '[Untitled](stanza:title)'",
      '      - style: cover-subtitle',
      "        text: '[](stanza:field:subtitle)'",
      '  - height: 2fr',
      '    content:',
      '      - style: cover-meta',
      "        text: '[](stanza:authors)'",
      '      - style: cover-meta',
      "        text: '[](stanza:field:date)'",
    ),
  },
  {
    id: 'band',
    label: 'Bands',
    description:
      'A colored band at the top, the title on white, and a dark band at the bottom with the authors in white; edge to edge.',
    fields: ['subtitle', 'date'],
    colors: COLORS,
    paragraphStyles: [
      TITLE,
      SUBTITLE,
      META,
      centred('cover-title-centre', 'cover-title'),
      centred('cover-subtitle-centre', 'cover-subtitle'),
      light('cover-meta-light', 'cover-meta'),
      centred('cover-meta-light-centre', 'cover-meta-light'),
    ],
    tableStyles: [],
    cover: lines(
      'margins: { top: 0, right: 0, bottom: 0, left: 0 }',
      'rows:',
      '  - height: 120',
      '    background: cover-accent',
      '  - height: 2fr',
      '    valign: center',
      '    content:',
      '      - style: cover-title-centre',
      "        text: '[Untitled](stanza:title)'",
      '      - style: cover-subtitle-centre',
      "        text: '[](stanza:field:subtitle)'",
      '  - height: 1fr',
      '    valign: center',
      '    background: cover-deep',
      '    content:',
      '      - style: cover-meta-light-centre',
      "        text: '[](stanza:authors)'",
      '      - style: cover-meta-light-centre',
      "        text: '[](stanza:field:date)'",
    ),
  },
  {
    id: 'side-band',
    label: 'Side band',
    description:
      'A colored strip down the left edge, the title and subtitle on the right low on the page, the authors and date under them.',
    fields: ['subtitle', 'date'],
    colors: COLORS,
    paragraphStyles: [TITLE, SUBTITLE, META],
    tableStyles: [],
    cover: lines(
      'margins: { top: 0, right: 56, bottom: 56, left: 0 }',
      'columns: [90, 36, 1fr]',
      'rows: [3fr, 2fr]',
      'areas:',
      "  - 'strip . title'",
      "  - 'strip . meta'",
      'area:',
      '  strip:',
      '    background: cover-accent',
      '    content: []',
      '  title:',
      '    valign: bottom',
      '    content:',
      '      - style: cover-title',
      "        text: '[Untitled](stanza:title)'",
      '      - style: cover-subtitle',
      "        text: '[](stanza:field:subtitle)'",
      '  meta:',
      '    content:',
      '      - style: cover-meta',
      "        text: '[](stanza:authors)'",
      '      - style: cover-meta',
      "        text: '[](stanza:field:date)'",
    ),
  },
  {
    id: 'controlled-document',
    label: 'Controlled document',
    description:
      'The title at the top and a table of the document number, version, status, date and classification at the bottom.',
    fields: ['document-number', 'status', 'date'],
    colors: COLORS,
    paragraphStyles: [
      TITLE,
      SUBTITLE,
      [
        'cover-cell',
        lines('based-on: body', 'size: 10', 'space-after: 0', 'line-spacing: { multiple: 1 }'),
      ],
    ],
    tableStyles: [
      [
        'cover-table',
        lines(
          'cell-style: cover-cell',
          'border:',
          '  outer: { width: 0.75, color: cover-muted }',
          '  inside-horizontal: { width: 0.5, color: cover-muted }',
          'cell-padding: 4',
        ),
      ],
    ],
    cover: lines(
      'rows:',
      '  - height: 2fr',
      '    content:',
      '      - style: cover-title',
      "        text: '[Untitled](stanza:title)'",
      '      - style: cover-subtitle',
      "        text: '[](stanza:field:subtitle)'",
      '  - height: 1fr',
      '    valign: bottom',
      '    content:',
      '      - table:',
      '          style: cover-table',
      '          rows:',
      "            - label: 'Document number'",
      "              value: '[](stanza:field:document-number)'",
      "            - label: 'Version'",
      "              value: '[](stanza:version)'",
      "            - label: 'Status'",
      "              value: '[](stanza:field:status)'",
      "            - label: 'Date'",
      "              value: '[](stanza:field:date)'",
      "            - label: 'Classification'",
      "              value: '[](stanza:classification)'",
    ),
  },
];

/**
 * The stylesheet with a preset as the cover of a page template: the color tokens and styles it uses
 * that the stylesheet lacks are added first, then the cover replaces the one there is. One edit:
 * refused as a whole when any part of it would make an error.
 */
export function applyCoverPreset(source: string, template: string, id: string): StylesheetEdit {
  const preset = COVER_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) {
    return { ok: false, code: 'invalid-value', message: `There is no cover preset "${id}".` };
  }
  const sheet = parseStylesheet(source).stylesheet;
  let text = source;
  const steps: ((current: string) => StylesheetEdit)[] = [
    ...Object.entries(preset.colors)
      .filter(([name]) => !sheet.tokens.colors.has(name))
      .map(
        ([name, hex]) =>
          (current: string) =>
            setProperty(current, ['tokens', 'colors', name], hex),
      ),
    ...preset.paragraphStyles
      .filter(([name]) => ![...sheet.paragraphStyles.keys()].some((known) => known === name))
      .map(
        ([name, body]) =>
          (current: string) =>
            setBlock(current, ['paragraph-styles', name], body),
      ),
    ...preset.tableStyles
      .filter(([name]) => ![...sheet.tableStyles.keys()].some((known) => known === name))
      .map(
        ([name, body]) =>
          (current: string) =>
            setBlock(current, ['table-styles', name], body),
      ),
    (current: string) => setBlock(current, ['page-templates', template, 'cover'], preset.cover),
  ];
  for (const step of steps) {
    const edited = step(text);
    if (!edited.ok) return edited;
    text = edited.text;
  }
  return { ok: true, text };
}
