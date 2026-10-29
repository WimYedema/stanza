import { isStyleName, type StyleName } from './style-name.js';

/** A color: a literal `#RRGGBB` or the name of a color token. */
export type ColorValue =
  | { readonly kind: 'hex'; readonly hex: string }
  | { readonly kind: 'token'; readonly name: string };

/** A font: a list of families (the first is the one DOCX uses) or the name of a font token. */
export type FontValue =
  | { readonly kind: 'families'; readonly families: readonly string[] }
  | { readonly kind: 'token'; readonly name: string };

export interface TextProps {
  readonly font?: FontValue;
  readonly sizePt?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly color?: ColorValue;
  readonly highlight?: ColorValue;
}

export type LineSpacing =
  | { readonly rule: 'at-least'; readonly pt: number }
  | { readonly rule: 'exactly'; readonly pt: number }
  | { readonly rule: 'multiple'; readonly factor: number };

export type Alignment = 'left' | 'center' | 'right' | 'justify';

export interface ParagraphProps {
  readonly spaceBeforePt?: number;
  readonly spaceAfterPt?: number;
  readonly lineSpacing?: LineSpacing;
  readonly indentLeftPt?: number;
  /** Signed: a negative value is a hanging indent. */
  readonly firstLineIndentPt?: number;
  readonly alignment?: Alignment;
  readonly keepWithNext?: boolean;
  readonly keepTogether?: boolean;
  readonly pageBreakBefore?: boolean;
  /** Headings in this style get a number (ADR 0011). Inherited like other properties. */
  readonly numbered?: boolean;
  readonly background?: ColorValue;
}

/** The marks that a paragraph style can allow. */
export type VariantMark = 'strong' | 'emphasis' | 'code' | 'link';

export const VARIANT_MARKS: readonly VariantMark[] = ['strong', 'emphasis', 'code', 'link'];

/** Extra text properties for a mark, or null to switch off a variant inherited from a base. */
export type VariantDeclaration = TextProps | null;

export interface ParagraphStyle {
  readonly basedOn?: StyleName;
  readonly text: TextProps;
  readonly paragraph: ParagraphProps;
  readonly variants: Readonly<Partial<Record<VariantMark, VariantDeclaration>>>;
}

export interface CharacterStyle {
  readonly basedOn?: StyleName;
  readonly text: TextProps;
}

export interface Border {
  readonly widthPt: number;
  readonly color: ColorValue;
}

export interface TableBorders {
  readonly outer?: Border;
  readonly insideHorizontal?: Border;
  readonly insideVertical?: Border;
}

export interface HeaderRow {
  readonly text: TextProps;
  readonly background?: ColorValue;
  /** Repeat the header row on every page. */
  readonly repeat?: boolean;
}

export interface TableStyle {
  readonly basedOn?: StyleName;
  /** The paragraph style of the text in cells. Absent means `body`. */
  readonly cellStyle?: StyleName;
  readonly border?: TableBorders;
  readonly headerRow?: HeaderRow;
  readonly cellPaddingPt?: number;
}

export interface Tokens {
  /** Token name to `#RRGGBB`. */
  readonly colors: ReadonlyMap<string, string>;
  /** Token name to font families. */
  readonly fonts: ReadonlyMap<string, readonly string[]>;
}

export type PageSize = 'A4' | 'Letter';

export interface PageMargins {
  readonly topPt: number;
  readonly rightPt: number;
  readonly bottomPt: number;
  readonly leftPt: number;
}

/** The page of a document: its size and margins. Header and footer slots are a later addition. */
export interface PageTemplate {
  readonly size: PageSize;
  readonly margins: PageMargins;
}

export interface Stylesheet {
  readonly tokens: Tokens;
  readonly paragraphStyles: ReadonlyMap<StyleName, ParagraphStyle>;
  readonly characterStyles: ReadonlyMap<StyleName, CharacterStyle>;
  readonly tableStyles: ReadonlyMap<StyleName, TableStyle>;
  /** Named page templates, keyed like styles. May be empty (ADR 0016). */
  readonly pageTemplates: ReadonlyMap<StyleName, PageTemplate>;
}

function styleName(value: string): StyleName {
  if (!isStyleName(value)) throw new Error(`Invalid style name "${value}".`);
  return value;
}

/** Paragraph styles every stylesheet must define. */
export const RESERVED_PARAGRAPH_STYLES: readonly StyleName[] = [
  'body',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'code',
  'list-bulleted',
  'list-numbered',
].map(styleName);

/** The table style every stylesheet must define. */
export const RESERVED_TABLE_STYLE: StyleName = styleName('table');

/** The page template that documents use unless they select another. */
export const DEFAULT_PAGE_TEMPLATE_NAME: StyleName = styleName('page');

/** The page of a stylesheet that declares no `page` template: A4 with 2.54 cm margins. */
export const BUILT_IN_PAGE_TEMPLATE: PageTemplate = {
  size: 'A4',
  margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
};
