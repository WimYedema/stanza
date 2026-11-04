import type {
  Border,
  ColorValue,
  FontValue,
  LineSpacing,
  ParagraphProps,
  PropertyType,
  StyleName,
  Stylesheet,
  TextProps,
  VariantMark,
} from '@phrase/core';

/**
 * What the paragraph panel needs to know about a property of a style (ADR 0037): whether the style
 * sets it itself or has it from a base, how to write a value so that a person can read it, and how
 * to read what a person typed.
 */

export type Group = 'text' | 'paragraph';

export interface PropertyState {
  /** What the style sets itself. */
  readonly own: unknown;
  /** What the nearest base that sets it gives, and which base that is. */
  readonly inherited: { readonly value: unknown; readonly from: StyleName } | undefined;
}

/** What paragraph styles and character styles have in common for the panel. */
export interface StyleLike {
  readonly basedOn?: StyleName;
  readonly label?: string;
  readonly text: TextProps;
  readonly paragraph?: ParagraphProps;
}

/** The value of a property that a style sets itself, or from the nearest base that sets it. */
export function stateOf(
  styles: ReadonlyMap<StyleName, StyleLike>,
  name: StyleName,
  group: Group,
  prop: string,
): PropertyState {
  return stateBy(styles, name, (style) =>
    group === 'text'
      ? style.text[prop as keyof TextProps]
      : style.paragraph?.[prop as keyof ParagraphProps],
  );
}

/** The same for any kind of style and any `read` of one of its values, such as a border of a table. */
export function stateBy<T extends { readonly basedOn?: StyleName }>(
  styles: ReadonlyMap<StyleName, T>,
  name: StyleName,
  read: (style: T) => unknown,
): PropertyState {
  const style = styles.get(name);
  const own = style === undefined ? undefined : read(style);
  const seen = new Set<StyleName>([name]);
  let base = style?.basedOn;
  while (base !== undefined && !seen.has(base)) {
    seen.add(base);
    const baseStyle = styles.get(base);
    if (baseStyle === undefined) break;
    const value = read(baseStyle);
    if (value !== undefined) return { own, inherited: { value, from: base } };
    base = baseStyle.basedOn;
  }
  return { own, inherited: undefined };
}

export const colorText = (value: ColorValue): string =>
  value.kind === 'hex' ? value.hex : value.name;
const fontText = (value: FontValue): string =>
  value.kind === 'token' ? value.name : value.families.join(', ');

export function lineSpacingText(value: LineSpacing): string {
  if (value.rule === 'multiple') return `${String(value.factor)} lines`;
  return `${value.rule === 'at-least' ? 'at least' : 'exactly'} ${String(value.pt)} pt`;
}

/** A border as a person reads it: "0.75 pt rule". */
export const borderText = (value: Border): string =>
  `${String(value.widthPt)} pt ${colorText(value.color)}`;

/** A value as a person reads it. */
export function valueText(type: PropertyType, value: unknown): string {
  switch (type.kind) {
    case 'boolean':
      return value === true ? 'yes' : 'no';
    case 'color':
      return colorText(value as ColorValue);
    case 'font':
      return fontText(value as FontValue);
    case 'line-spacing':
      return lineSpacingText(value as LineSpacing);
    case 'number':
      return `${String(value)} ${type.unit}`;
    default:
      return String(value);
  }
}

/** The name of a property for people: `space-before` is "Space before". */
export function titleOf(key: string): string {
  const words = key.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TOKEN_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** A number that was typed, `null` for none, or undefined for text that is not a number. */
export function numberFrom(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** A font that was typed: the name of a token, or families separated by commas. `null` for none. */
export function fontFrom(text: string): string | readonly string[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (TOKEN_NAME.test(trimmed)) return trimmed;
  const families = trimmed
    .split(',')
    .map((family) => family.trim())
    .filter((family) => family !== '');
  return families.length === 0 ? null : families;
}

/**
 * The variant of a mark: what the style declares (an object to allow it, `null` for switched off),
 * and what the nearest base that declares one gives.
 */
export function variantStateOf(
  stylesheet: Stylesheet,
  name: StyleName,
  mark: VariantMark,
): PropertyState {
  const style = stylesheet.paragraphStyles.get(name);
  const own = style?.variants[mark];
  const seen = new Set<StyleName>([name]);
  let base = style?.basedOn;
  while (base !== undefined && !seen.has(base)) {
    seen.add(base);
    const baseStyle = stylesheet.paragraphStyles.get(base);
    if (baseStyle === undefined) break;
    const value = baseStyle.variants[mark];
    if (value !== undefined) return { own, inherited: { value, from: base } };
    base = baseStyle.basedOn;
  }
  return { own, inherited: undefined };
}

/** The rules of a line spacing, with what a number of each means and a number to start from. */
export const LINE_SPACING_RULES: readonly {
  rule: LineSpacing['rule'];
  title: string;
  start: number;
}[] = [
  { rule: 'multiple', title: 'Lines', start: 1 },
  { rule: 'at-least', title: 'At least (pt)', start: 12 },
  { rule: 'exactly', title: 'Exactly (pt)', start: 12 },
];
