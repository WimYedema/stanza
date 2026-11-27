import {
  type Alignment,
  type CoverGrid,
  type HeaderFooter,
  type LineSpacing,
  type PageMargins,
  type PageSize,
} from '@stanza/core';

/**
 * What the import of the cover of a Word template gives (ADR 0094); `cover-template.ts` exports
 * these.
 */

/** A paragraph style for the stylesheet, as the template shows it. Colors and fonts are tokens. */
export interface ImportedParagraphStyle {
  readonly name: string;
  readonly font?: string;
  readonly sizePt?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: string;
  readonly alignment?: Alignment;
  readonly spaceBeforePt?: number;
  readonly spaceAfterPt?: number;
  readonly lineSpacing?: LineSpacing;
  readonly indentLeftPt?: number;
}

export interface ImportedBorder {
  readonly widthPt: number;
  readonly color: string;
}

/** A table style for a cover table: its borders and the style of its cells. */
export interface ImportedTableStyle {
  readonly name: string;
  readonly cellStyle: string;
  readonly outer?: ImportedBorder;
  readonly insideHorizontal?: ImportedBorder;
  readonly insideVertical?: ImportedBorder;
  readonly cellPaddingPt?: number;
}

export interface CoverTemplateImport {
  readonly name: string;
  /** The page of the body: its size and margins. */
  readonly size: PageSize;
  readonly margins: PageMargins;
  readonly cover: CoverGrid;
  /** The header and the footer of the body pages, as grids (ADR 0095). */
  readonly header?: HeaderFooter;
  readonly footer?: HeaderFooter;
  readonly paragraphStyles: readonly ImportedParagraphStyle[];
  readonly tableStyles: readonly ImportedTableStyle[];
  /** New color tokens, by name, as `#RRGGBB`. */
  readonly colors: readonly (readonly [string, string])[];
  /** New font tokens, by name. */
  readonly fonts: readonly (readonly [string, readonly string[]])[];
  readonly images: readonly { readonly path: string; readonly bytes: Uint8Array }[];
  /** The custom fields that the cover shows, which the project file declares. */
  readonly fields: readonly string[];
  readonly converted: readonly string[];
  readonly approximated: readonly string[];
  readonly leftOut: readonly string[];
}

export type CoverTemplateResult =
  | { readonly ok: true; readonly result: CoverTemplateImport }
  | { readonly ok: false; readonly message: string };

export interface CoverTemplateOptions {
  /** The name of the page template, kebab-case; it also names the styles, tokens and images. */
  readonly name: string;
  /** Where the images go, relative to the project root, such as `assets/report`. */
  readonly assetsDirectory: string;
  /** The color tokens of the stylesheet, to reuse one of the same value. */
  readonly colors: ReadonlyMap<string, string>;
  /** The font tokens of the stylesheet, to reuse one of the same family. */
  readonly fonts: ReadonlyMap<string, readonly string[]>;
}
