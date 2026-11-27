import { PAGE_SIZES, type PageTemplate } from '@stanza/core';

/** The page of a document in twips, as the library wants it. */
export interface PageGeometry {
  readonly widthTwips: number;
  readonly heightTwips: number;
  readonly marginTopTwips: number;
  readonly marginRightTwips: number;
  readonly marginBottomTwips: number;
  readonly marginLeftTwips: number;
  /** The distance of header and footer from the edge: the template's, or 1.25 cm (ADR 0095). */
  readonly headerTwips: number;
  readonly footerTwips: number;
  /** The width of the text area. */
  readonly textWidthTwips: number;
}

const twips = (pt: number): number => Math.round(pt * 20);

/** Where Word puts a header and a footer from the edge of the page by default: 1.25 cm. */
const DEFAULT_DISTANCE_PT = 35.4;

export function pageGeometry(template: PageTemplate): PageGeometry {
  const size = PAGE_SIZES[template.size];
  const { margins } = template;
  return {
    widthTwips: twips(size.widthPt),
    heightTwips: twips(size.heightPt),
    marginTopTwips: twips(margins.topPt),
    marginRightTwips: twips(margins.rightPt),
    marginBottomTwips: twips(margins.bottomPt),
    marginLeftTwips: twips(margins.leftPt),
    headerTwips: twips(template.header?.distancePt ?? DEFAULT_DISTANCE_PT),
    footerTwips: twips(template.footer?.distancePt ?? DEFAULT_DISTANCE_PT),
    textWidthTwips: twips(size.widthPt - margins.leftPt - margins.rightPt),
  };
}
