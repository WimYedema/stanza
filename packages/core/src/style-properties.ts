import type { ParagraphProps, TextProps } from './stylesheet.js';

/**
 * The properties that a stylesheet file can set, in one list: the name in the file, the kind of
 * value, the unit, and where it can be written (ADR 0033). The parser and the validation read it,
 * and so will the style editor, so that a property is added in one place.
 */

/** A place in the stylesheet file where properties are written. */
export type PropertyPlace =
  | 'paragraph-style'
  | 'character-style'
  | 'table-style'
  /** The text properties of a mark in `variants`. */
  | 'variant'
  | 'header-row'
  /** The `odd` and `even` backgrounds of the `banded-rows` of a table style. */
  | 'banded-rows'
  /** The three sides of the `border` of a table style. */
  | 'borders'
  /** The width and color of one border. */
  | 'border';

/** What a number may be: above zero, zero or more, or any finite number (a hanging indent). */
export type NumberRange = 'positive' | 'non-negative' | 'any';

export type PropertyType =
  | { readonly kind: 'number'; readonly unit: 'pt'; readonly range: NumberRange }
  | { readonly kind: 'boolean' }
  /** A `#RRGGBB` value or the name of a color token. */
  | { readonly kind: 'color' }
  /** The name of a font token or a list of family names. */
  | { readonly kind: 'font' }
  | { readonly kind: 'choice'; readonly values: readonly string[] }
  /** One of `at-least` and `exactly` in points, or `multiple` as a factor. Above zero. */
  | { readonly kind: 'line-spacing' }
  /** Text that people read: a label. */
  | { readonly kind: 'text' }
  /** The name of a style of the same kind, or of a paragraph style. */
  | { readonly kind: 'style-name'; readonly of: 'same-kind' | 'paragraph' }
  /** Written as a mapping that has properties of its own. */
  | { readonly kind: 'variants' }
  | { readonly kind: 'borders' }
  | { readonly kind: 'border' }
  | { readonly kind: 'header-row' }
  | { readonly kind: 'banded-rows' };

export interface StyleProperty {
  /** The name in the stylesheet file, in kebab-case. */
  readonly key: string;
  readonly type: PropertyType;
  readonly places: readonly PropertyPlace[];
}

/** A property that is a field of `TextProps`, named by `prop`. */
export interface TextProperty extends StyleProperty {
  readonly prop: keyof TextProps;
}

/** A property that is a field of `ParagraphProps`, named by `prop`. */
export interface ParagraphProperty extends StyleProperty {
  readonly prop: keyof ParagraphProps;
}

export const ALIGNMENT_VALUES: readonly string[] = ['left', 'center', 'right', 'justify'];

const pt = (range: NumberRange): PropertyType => ({ kind: 'number', unit: 'pt', range });
const flag: PropertyType = { kind: 'boolean' };

const TEXT_PLACES: readonly PropertyPlace[] = [
  'paragraph-style',
  'character-style',
  'variant',
  'header-row',
];

const text = (key: string, prop: keyof TextProps, type: PropertyType): TextProperty => ({
  key,
  prop,
  type,
  places: TEXT_PLACES,
});

const paragraph = (
  key: string,
  prop: keyof ParagraphProps,
  type: PropertyType,
): ParagraphProperty => ({ key, prop, type, places: ['paragraph-style'] });

/** The text properties, which a paragraph style, a character style, a variant and a header row share. */
export const TEXT_PROPERTIES: readonly TextProperty[] = [
  text('font', 'font', { kind: 'font' }),
  text('size', 'sizePt', pt('positive')),
  text('bold', 'bold', flag),
  text('italic', 'italic', flag),
  text('underline', 'underline', flag),
  text('color', 'color', { kind: 'color' }),
  text('highlight', 'highlight', { kind: 'color' }),
];

export const PARAGRAPH_PROPERTIES: readonly ParagraphProperty[] = [
  paragraph('space-before', 'spaceBeforePt', pt('non-negative')),
  paragraph('space-after', 'spaceAfterPt', pt('non-negative')),
  paragraph('indent-left', 'indentLeftPt', pt('non-negative')),
  paragraph('first-line-indent', 'firstLineIndentPt', pt('any')),
  paragraph('line-spacing', 'lineSpacing', { kind: 'line-spacing' }),
  paragraph('alignment', 'alignment', { kind: 'choice', values: ALIGNMENT_VALUES }),
  paragraph('keep-with-next', 'keepWithNext', flag),
  paragraph('keep-together', 'keepTogether', flag),
  paragraph('page-break-before', 'pageBreakBefore', flag),
  paragraph('background', 'background', { kind: 'color' }),
  paragraph('numbered', 'numbered', flag),
];

/** Every property that a stylesheet file can set, in the order they are read. */
export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  {
    key: 'based-on',
    type: { kind: 'style-name', of: 'same-kind' },
    places: ['paragraph-style', 'character-style', 'table-style'],
  },
  {
    key: 'label',
    type: { kind: 'text' },
    places: ['paragraph-style', 'character-style', 'table-style'],
  },
  ...TEXT_PROPERTIES,
  ...PARAGRAPH_PROPERTIES,
  { key: 'variants', type: { kind: 'variants' }, places: ['paragraph-style'] },
  {
    key: 'cell-style',
    type: { kind: 'style-name', of: 'paragraph' },
    places: ['table-style'],
  },
  { key: 'border', type: { kind: 'borders' }, places: ['table-style'] },
  { key: 'header-row', type: { kind: 'header-row' }, places: ['table-style'] },
  { key: 'banded-rows', type: { kind: 'banded-rows' }, places: ['table-style'] },
  { key: 'cell-padding', type: pt('non-negative'), places: ['table-style'] },
  { key: 'background', type: { kind: 'color' }, places: ['header-row'] },
  { key: 'repeat', type: flag, places: ['header-row'] },
  { key: 'odd', type: { kind: 'color' }, places: ['banded-rows'] },
  { key: 'even', type: { kind: 'color' }, places: ['banded-rows'] },
  { key: 'outer', type: { kind: 'border' }, places: ['borders'] },
  { key: 'inside-horizontal', type: { kind: 'border' }, places: ['borders'] },
  { key: 'inside-vertical', type: { kind: 'border' }, places: ['borders'] },
  { key: 'width', type: pt('positive'), places: ['border'] },
  { key: 'color', type: { kind: 'color' }, places: ['border'] },
];

/** The properties that can be written in a place. */
export function propertiesAt(place: PropertyPlace): readonly StyleProperty[] {
  return STYLE_PROPERTIES.filter((property) => property.places.includes(place));
}

/** The names that can be written in a place, which the parser allows and reports others against. */
export function propertyKeys(place: PropertyPlace): readonly string[] {
  return propertiesAt(place).map((property) => property.key);
}
