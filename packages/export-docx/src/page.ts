import { PAGE_SIZES, type PageTemplate } from '@phrase/core';

/** The page of a document in twips, as the library wants it. */
export interface PageGeometry {
  readonly widthTwips: number;
  readonly heightTwips: number;
  readonly marginTopTwips: number;
  readonly marginRightTwips: number;
  readonly marginBottomTwips: number;
  readonly marginLeftTwips: number;
  /** The distance of header and footer from the edge, which is the library's 1.25 cm. */
  readonly headerTwips: number;
  readonly footerTwips: number;
  /** The width of the text area. */
  readonly textWidthTwips: number;
}

const twips = (pt: number): number => Math.round(pt * 20);

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
    headerTwips: 708,
    footerTwips: 708,
    textWidthTwips: twips(size.widthPt - margins.leftPt - margins.rightPt),
  };
}
