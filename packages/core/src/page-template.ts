import type { StyleName } from './style-name.js';
import {
  BUILT_IN_PAGE_TEMPLATE,
  DEFAULT_PAGE_TEMPLATE_NAME,
  type PageSize,
  type PageTemplate,
  type Stylesheet,
} from './stylesheet.js';

/** The sizes of the supported pages, in points. */
export const PAGE_SIZES: Readonly<
  Record<PageSize, { readonly widthPt: number; readonly heightPt: number }>
> = {
  A4: { widthPt: 595.3, heightPt: 841.9 },
  Letter: { widthPt: 612, heightPt: 792 },
};

export const PAGE_SIZE_NAMES: readonly PageSize[] = ['A4', 'Letter'];

/** The text area must be at least this wide and high, in points. */
export const MIN_TEXT_AREA_PT = 50;

/** The name of the page template that a document selects with its `page-template` field. */
export const PAGE_TEMPLATE_FIELD = 'page-template';

/**
 * The page template for a name. Without a name it is the template called `page`, or the built-in
 * page when the stylesheet has none. A name the stylesheet does not declare gives undefined.
 */
export function resolvePageTemplate(
  stylesheet: Stylesheet,
  name?: string,
): PageTemplate | undefined {
  if (name === undefined || name === DEFAULT_PAGE_TEMPLATE_NAME) {
    return stylesheet.pageTemplates.get(DEFAULT_PAGE_TEMPLATE_NAME) ?? BUILT_IN_PAGE_TEMPLATE;
  }
  // A name that is not a valid style name cannot be declared.
  return stylesheet.pageTemplates.get(name as StyleName);
}
