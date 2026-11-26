import type { StyleName } from './style-name.js';
import {
  RESERVED_PARAGRAPH_STYLES,
  RESERVED_TABLE_STYLE,
  coverEntries,
  type Cover,
  type Stylesheet,
} from './stylesheet.js';

export type StyleFamily = 'paragraph' | 'character' | 'table';

/** The styles that every stylesheet must define (ADR 0006), which cannot be deleted. */
export function isReservedStyle(family: StyleFamily, name: StyleName): boolean {
  if (family === 'paragraph') return RESERVED_PARAGRAPH_STYLES.includes(name);
  return family === 'table' && name === RESERVED_TABLE_STYLE;
}

const coverUses = (cover: Cover | undefined, family: StyleFamily, name: string) =>
  cover !== undefined &&
  coverEntries(cover).some((entry) =>
    entry.kind === 'table'
      ? family === 'table' && entry.style === name
      : family === 'paragraph' && entry.style === name,
  );

/**
 * What in the stylesheet itself refers to a style, as sentences: a style based on it, a table
 * style that has it as the cell style, a page template that uses it in its header, footer or
 * cover or title block. A style that something refers to cannot be deleted without breaking the stylesheet.
 */
export function styleReferences(
  stylesheet: Stylesheet,
  family: StyleFamily,
  name: StyleName,
): readonly string[] {
  const found: string[] = [];
  const bases: Record<StyleFamily, ReadonlyMap<StyleName, { readonly basedOn?: StyleName }>> = {
    paragraph: stylesheet.paragraphStyles,
    character: stylesheet.characterStyles,
    table: stylesheet.tableStyles,
  };
  for (const [other, style] of bases[family]) {
    if (style.basedOn === name) found.push(`The ${family} style "${other}" is based on it.`);
  }
  if (family === 'paragraph') {
    for (const [table, style] of stylesheet.tableStyles) {
      if (style.cellStyle === name) {
        found.push(`The table style "${table}" has it as its cell style.`);
      }
    }
  }
  for (const [template, page] of stylesheet.pageTemplates) {
    if (family === 'paragraph') {
      if (page.header?.style === name)
        found.push(`The page template "${template}" uses it in its header.`);
      if (page.footer?.style === name)
        found.push(`The page template "${template}" uses it in its footer.`);
    }
    for (const part of ['header', 'footer'] as const) {
      const grid = page[part]?.grid;
      if (grid !== undefined && coverUses(grid, family, name)) {
        found.push(`The page template "${template}" uses it in its ${part}.`);
      }
    }
    if (coverUses(page.cover, family, name)) {
      found.push(`The page template "${template}" uses it in its cover.`);
    }
    const titleBlock = page.titleBlock;
    if (
      titleBlock !== undefined &&
      coverUses({ kind: 'list', entries: titleBlock }, family, name)
    ) {
      found.push(`The page template "${template}" uses it in its title block.`);
    }
  }
  return found;
}
