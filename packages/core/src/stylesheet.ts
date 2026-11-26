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
  /** The name that people see (ADR 0034). Absent means the name of the style. */
  readonly label?: string;
  readonly text: TextProps;
  readonly paragraph: ParagraphProps;
  readonly variants: Readonly<Partial<Record<VariantMark, VariantDeclaration>>>;
}

export interface CharacterStyle {
  readonly basedOn?: StyleName;
  readonly label?: string;
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

/** The background of the odd and the even body rows. The header row is not counted. */
export interface BandedRows {
  readonly odd?: ColorValue;
  readonly even?: ColorValue;
}

export interface TableStyle {
  readonly basedOn?: StyleName;
  readonly label?: string;
  /** The paragraph style of the text in cells. Absent means `body`. */
  readonly cellStyle?: StyleName;
  readonly border?: TableBorders;
  readonly headerRow?: HeaderRow;
  readonly bandedRows?: BandedRows;
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

/** The values a slot can show (ADR 0017, ADR 0019). The last three are Word fields. */
export const SLOT_TOKENS = [
  'title',
  'authors',
  'version',
  'classification',
  'page',
  'pages',
  'section',
] as const;

export type SlotToken = (typeof SLOT_TOKENS)[number];

/** Tokens that are Word fields, which only make sense on pages that have numbers. */
export const PAGINATION_TOKENS: readonly SlotToken[] = ['page', 'pages', 'section'];

/**
 * Text of a slot: literal text, a token, or a custom metadata field written `field:<name>`. The
 * label is shown when the value is missing.
 */
export type SlotPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'token'; readonly token: SlotToken; readonly label: string }
  | { readonly kind: 'field'; readonly name: string; readonly label: string };

/** The header or the footer of a page: three slots on one line. A slot may be empty. */
export interface HeaderFooter {
  /** The paragraph style of the line. Absent means `body`. */
  readonly style?: StyleName;
  readonly left: readonly SlotPart[];
  readonly center: readonly SlotPart[];
  readonly right: readonly SlotPart[];
  /**
   * The distance of the header from the top edge of the page, or of the footer from the bottom
   * edge, in points (ADR 0095). Absent means 1.25 cm.
   */
  readonly distancePt?: number;
  /**
   * A grid in place of the three slots (ADR 0095): columns, rows that grow or have points, and
   * areas with entries, which may show the page fields. The slots are empty then.
   */
  readonly grid?: CoverGrid;
}

/**
 * One entry of a cover page: a paragraph, a table of label and value rows (ADR 0019), or an image
 * in a paragraph of its style (ADR 0089).
 */
export type CoverEntry =
  | { readonly kind: 'paragraph'; readonly style?: StyleName; readonly text: readonly SlotPart[] }
  | { readonly kind: 'table'; readonly style: StyleName; readonly rows: readonly CoverRow[] }
  | CoverImage;

export interface CoverRow {
  readonly label: string;
  readonly value: readonly SlotPart[];
}

/** An image on a cover: a PNG or JPEG of the project, with its aspect ratio kept (ADR 0089). */
export interface CoverImage {
  readonly kind: 'image';
  /** Relative to the project root, with `/`. */
  readonly path: string;
  /** Absent means the size of the image in pixels at 96 per inch. */
  readonly widthPt?: number;
  /** The paragraph style that holds the image. Absent means `body`. */
  readonly style?: StyleName;
}

/** The height of a cover row: in points, a share of what is left, or as tall as its content. */
export type CoverRowHeight =
  | { readonly kind: 'points'; readonly pt: number }
  | { readonly kind: 'share'; readonly fr: number }
  | { readonly kind: 'auto' };

export const COVER_ALIGNMENTS = ['top', 'center', 'bottom'] as const;
export type CoverAlignment = (typeof COVER_ALIGNMENTS)[number];

/** One row of a cover that is divided into rows (ADR 0089). */
export interface CoverLayoutRow {
  readonly height: CoverRowHeight;
  readonly valign: CoverAlignment;
  /** A color token that fills the row from edge to edge of the cover's text area (ADR 0093). */
  readonly background?: ColorValue;
  readonly content: readonly CoverEntry[];
}

/**
 * A cover page: a list of entries written from the top (ADR 0019), or rows that divide the page,
 * with margins of its own (ADR 0089). A side the margins leave out takes the template's margin.
 */
export type Cover =
  | { readonly kind: 'list'; readonly entries: readonly CoverEntry[] }
  | {
      readonly kind: 'rows';
      readonly margins?: Partial<PageMargins>;
      readonly rows: readonly CoverLayoutRow[];
    }
  | CoverGrid;

/** The width of a grid column: in points, or a share of what is left (ADR 0092). */
export type CoverColumnWidth =
  | { readonly kind: 'points'; readonly pt: number }
  | { readonly kind: 'share'; readonly fr: number };

/** The content of a named area of a grid. */
export interface CoverArea {
  readonly valign: CoverAlignment;
  /** A color token that fills the area (ADR 0093). */
  readonly background?: ColorValue;
  readonly content: readonly CoverEntry[];
}

/**
 * A cover divided into columns and rows, with named areas that span them, as the template areas of
 * a CSS grid (ADR 0092). `areas` has a line for each row and a name for each column, or `.` for a
 * cell of no area.
 */
export interface CoverGrid {
  readonly kind: 'grid';
  readonly margins?: Partial<PageMargins>;
  readonly columns: readonly CoverColumnWidth[];
  readonly rows: readonly CoverRowHeight[];
  readonly areas: readonly (readonly string[])[];
  readonly area: Readonly<Record<string, CoverArea>>;
}

/** The name of a grid cell that belongs to no area. */
export const EMPTY_AREA = '.';

/** The entries of a cover, from top to bottom; for a grid, by area in the order they are given. */
export function coverEntries(cover: Cover): readonly CoverEntry[] {
  if (cover.kind === 'list') return cover.entries;
  if (cover.kind === 'rows') return cover.rows.flatMap((row) => row.content);
  return Object.values(cover.area).flatMap((area) => area.content);
}

/** The images that the covers, title blocks, headers and footers of page templates show. */
export function coverImagePaths(templates: Iterable<PageTemplate>): readonly string[] {
  const paths = new Set<string>();
  for (const template of templates) {
    const entries = [
      ...(template.cover === undefined ? [] : coverEntries(template.cover)),
      ...(template.titleBlock ?? []),
      ...[template.header?.grid, template.footer?.grid].flatMap((grid) =>
        grid === undefined ? [] : coverEntries(grid),
      ),
    ];
    for (const entry of entries) {
      if (entry.kind === 'image') paths.add(entry.path);
    }
  }
  return [...paths];
}

/**
 * The pages of a document: size, margins, header and footer, an optional cover page, and an
 * optional title block at the top of the first body page (ADR 0090).
 */
export interface PageTemplate {
  readonly size: PageSize;
  readonly margins: PageMargins;
  readonly header?: HeaderFooter;
  readonly footer?: HeaderFooter;
  readonly cover?: Cover;
  /** The entries of a cover, written before the content of the body. */
  readonly titleBlock?: readonly CoverEntry[];
}

export interface Stylesheet {
  readonly tokens: Tokens;
  readonly paragraphStyles: ReadonlyMap<StyleName, ParagraphStyle>;
  readonly characterStyles: ReadonlyMap<StyleName, CharacterStyle>;
  readonly tableStyles: ReadonlyMap<StyleName, TableStyle>;
  /** Named page templates, keyed like styles. May be empty (ADR 0016). */
  readonly pageTemplates: ReadonlyMap<StyleName, PageTemplate>;
  readonly tableOfContents: TableOfContentsOptions;
}

/** How tables of contents are written (ADR 0018). */
export interface TableOfContentsOptions {
  /** With page numbers a TOC is a Word field that Word asks to update; without, it is plain text. */
  readonly pageNumbers: boolean;
}

export const DEFAULT_TABLE_OF_CONTENTS: TableOfContentsOptions = { pageNumbers: true };

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
