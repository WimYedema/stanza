import type { StyleName } from './style-name.js';

/**
 * Word's own names for styles (ADR 0034). A style that Word names itself keeps that name in the
 * output so that its outline, table of contents and navigation work, and no other style may take
 * one of the names that Word has built in.
 */

/** The name in Word of a style that has a fixed one: `Normal`, `heading 1` and `toc 1`, or undefined. */
export function fixedWordStyleName(name: StyleName): string | undefined {
  if (name === 'body') return 'Normal';
  const heading = /^heading-([1-6])$/.exec(name)?.[1];
  if (heading !== undefined) return `heading ${heading}`;
  const toc = /^toc-([1-6])$/.exec(name)?.[1];
  return toc === undefined ? undefined : `toc ${toc}`;
}

const numbered = (name: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => `${name} ${String(from + index)}`);

/** The names of the styles that Word has built in, from its list of latent styles. */
export const WORD_BUILT_IN_STYLE_NAMES: readonly string[] = [
  'Normal',
  ...numbered('heading', 1, 9),
  ...numbered('index', 1, 9),
  ...numbered('toc', 1, 9),
  'Normal Indent',
  'footnote text',
  'annotation text',
  'header',
  'footer',
  'index heading',
  'caption',
  'table of figures',
  'envelope address',
  'envelope return',
  'footnote reference',
  'annotation reference',
  'line number',
  'page number',
  'endnote reference',
  'endnote text',
  'table of authorities',
  'macro',
  'toa heading',
  'List',
  'List Bullet',
  'List Number',
  ...numbered('List', 2, 5),
  ...numbered('List Bullet', 2, 5),
  ...numbered('List Number', 2, 5),
  'Title',
  'Closing',
  'Signature',
  'Default Paragraph Font',
  'Body Text',
  'Body Text Indent',
  'List Continue',
  ...numbered('List Continue', 2, 5),
  'Message Header',
  'Subtitle',
  'Salutation',
  'Date',
  'Body Text First Indent',
  'Body Text First Indent 2',
  'Note Heading',
  'Body Text 2',
  'Body Text 3',
  'Body Text Indent 2',
  'Body Text Indent 3',
  'Block Text',
  'Hyperlink',
  'FollowedHyperlink',
  'Strong',
  'Emphasis',
  'Document Map',
  'Plain Text',
  'E-mail Signature',
  'HTML Top of Form',
  'HTML Bottom of Form',
  'Normal (Web)',
  'HTML Acronym',
  'HTML Address',
  'HTML Cite',
  'HTML Code',
  'HTML Definition',
  'HTML Keyboard',
  'HTML Preformatted',
  'HTML Sample',
  'HTML Typewriter',
  'HTML Variable',
  'Normal Table',
  'annotation subject',
  'No List',
  ...numbered('Outline List', 1, 3),
  ...numbered('Table Simple', 1, 3),
  ...numbered('Table Classic', 1, 4),
  ...numbered('Table Colorful', 1, 3),
  ...numbered('Table Columns', 1, 5),
  'Table Grid',
  ...numbered('Table List', 1, 8),
  ...numbered('Table 3D effects', 1, 3),
  'Table Contemporary',
  'Table Elegant',
  'Table Professional',
  ...numbered('Table Subtle', 1, 2),
  ...numbered('Table Web', 1, 3),
  'Balloon Text',
  'Table Theme',
  'Placeholder Text',
  'No Spacing',
  'Revision',
  'List Paragraph',
  'Quote',
  'Intense Quote',
  'Subtle Emphasis',
  'Intense Emphasis',
  'Subtle Reference',
  'Intense Reference',
  'Book Title',
  'Bibliography',
  'TOC Heading',
];

const BUILT_IN = new Set(WORD_BUILT_IN_STYLE_NAMES.map((name) => name.toLowerCase()));

/** Whether a name is one that Word has built in. Word compares style names ignoring case. */
export function isWordBuiltInStyleName(name: string): boolean {
  return BUILT_IN.has(name.toLowerCase());
}
