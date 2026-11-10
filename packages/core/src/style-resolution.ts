import type { Mark } from './document.js';
import type { StyleName } from './style-name.js';
import {
  VARIANT_MARKS,
  type HeaderRow,
  type BandedRows,
  type ParagraphProps,
  type Stylesheet,
  type TableBorders,
  type TableStyle,
  type TextProps,
  type VariantMark,
} from './stylesheet.js';

export type InheritanceChain<T> =
  | { readonly ok: true; readonly chain: readonly T[] }
  | {
      readonly ok: false;
      readonly problem: 'unknown-style' | 'style-cycle';
      readonly name: StyleName;
    };

/** The style and its bases, root first. Fails on an unknown name or a cycle. */
export function inheritanceChain<T extends { readonly basedOn?: StyleName }>(
  styles: ReadonlyMap<StyleName, T>,
  name: StyleName,
): InheritanceChain<T> {
  const chain: T[] = [];
  const seen = new Set<StyleName>();
  let current: StyleName | undefined = name;
  while (current !== undefined) {
    if (seen.has(current)) return { ok: false, problem: 'style-cycle', name: current };
    seen.add(current);
    const style = styles.get(current);
    if (style === undefined) return { ok: false, problem: 'unknown-style', name: current };
    chain.unshift(style);
    current = style.basedOn;
  }
  return { ok: true, chain };
}

function merge<T extends object>(layers: readonly T[], empty: T): T {
  return layers.reduce<T>((merged, layer) => ({ ...merged, ...layer }), empty);
}

export interface ResolvedParagraphStyle {
  readonly name: StyleName;
  readonly text: TextProps;
  readonly paragraph: ParagraphProps;
  /** The marks this style allows, with their extra properties. */
  readonly variants: Readonly<Partial<Record<VariantMark, TextProps>>>;
}

/** A paragraph style with its bases applied, or undefined for an unknown name or a cycle. */
export function resolveParagraphStyle(
  stylesheet: Stylesheet,
  name: StyleName,
): ResolvedParagraphStyle | undefined {
  const result = inheritanceChain(stylesheet.paragraphStyles, name);
  if (!result.ok) return undefined;
  const variants = new Map<VariantMark, TextProps>();
  for (const style of result.chain) {
    for (const mark of VARIANT_MARKS) {
      const declared = style.variants[mark];
      if (declared === undefined) continue;
      if (declared === null) variants.delete(mark);
      else variants.set(mark, { ...variants.get(mark), ...declared });
    }
  }
  return {
    name,
    text: merge(
      result.chain.map((style) => style.text),
      {},
    ),
    paragraph: merge(
      result.chain.map((style) => style.paragraph),
      {},
    ),
    variants: Object.fromEntries(variants),
  };
}

/** A character style's text properties with its bases applied. */
export function resolveCharacterStyle(
  stylesheet: Stylesheet,
  name: StyleName,
): TextProps | undefined {
  const result = inheritanceChain(stylesheet.characterStyles, name);
  return result.ok
    ? merge(
        result.chain.map((style) => style.text),
        {},
      )
    : undefined;
}

function mergeBorders(layers: readonly (TableBorders | undefined)[]): TableBorders | undefined {
  const defined = layers.filter((layer): layer is TableBorders => layer !== undefined);
  return defined.length === 0 ? undefined : merge(defined, {});
}

function mergeHeaderRows(layers: readonly (HeaderRow | undefined)[]): HeaderRow | undefined {
  const defined = layers.filter((layer): layer is HeaderRow => layer !== undefined);
  if (defined.length === 0) return undefined;
  return {
    ...merge(defined, { text: {} }),
    text: merge(
      defined.map((row) => row.text),
      {},
    ),
  };
}

export type ResolvedTableStyle = Omit<TableStyle, 'basedOn'> & { readonly name: StyleName };

/** A table style with its bases applied. Borders and the header row merge property by property. */
export function resolveTableStyle(
  stylesheet: Stylesheet,
  name: StyleName,
): ResolvedTableStyle | undefined {
  const result = inheritanceChain(stylesheet.tableStyles, name);
  if (!result.ok) return undefined;
  const border = mergeBorders(result.chain.map((style) => style.border));
  const headerRow = mergeHeaderRows(result.chain.map((style) => style.headerRow));
  const banded = result.chain
    .map((style) => style.bandedRows)
    .filter((layer): layer is BandedRows => layer !== undefined);
  const bandedRows = banded.length === 0 ? undefined : merge(banded, {});
  const padding = result.chain.map((style) => style.cellPaddingPt).filter((p) => p !== undefined);
  const cellPaddingPt = padding[padding.length - 1];
  const cellStyles = result.chain.map((style) => style.cellStyle).filter((s) => s !== undefined);
  const cellStyle = cellStyles[cellStyles.length - 1];
  return {
    name,
    ...(cellStyle !== undefined ? { cellStyle } : {}),
    ...(border !== undefined ? { border } : {}),
    ...(headerRow !== undefined ? { headerRow } : {}),
    ...(bandedRows !== undefined ? { bandedRows } : {}),
    ...(cellPaddingPt !== undefined ? { cellPaddingPt } : {}),
  };
}

function isVariantMark(type: Mark['type']): type is VariantMark {
  return type !== 'style';
}

/** Whether a paragraph style offers a mark. The editor must refuse a mark that is not allowed. */
export function markAllowed(stylesheet: Stylesheet, style: StyleName, mark: VariantMark): boolean {
  return resolveParagraphStyle(stylesheet, style)?.variants[mark] !== undefined;
}

/**
 * The text properties of a run: the paragraph style's, then `base` if given (properties that a
 * container such as a table header row adds to the paragraph style), then the variant of each
 * mark, then each character style. Marks that the paragraph style does not allow add nothing.
 */
export function resolveTextProps(
  stylesheet: Stylesheet,
  paragraphStyle: StyleName,
  marks: readonly Mark[],
  base: TextProps = {},
): TextProps | undefined {
  const paragraph = resolveParagraphStyle(stylesheet, paragraphStyle);
  if (paragraph === undefined) return undefined;
  let props = { ...paragraph.text, ...base };
  for (const mark of marks) {
    if (isVariantMark(mark.type)) props = { ...props, ...paragraph.variants[mark.type] };
  }
  for (const mark of marks) {
    if (mark.type === 'style') {
      props = { ...props, ...resolveCharacterStyle(stylesheet, mark.name) };
    }
  }
  return props;
}
