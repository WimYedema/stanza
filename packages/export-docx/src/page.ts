/**
 * The page the exporter writes: A4 with 2.54 cm margins, which is also the library's default.
 * Writing it down makes the text width a fact of ours, until page templates provide it.
 */
export const PAGE = {
  widthTwips: 11906,
  heightTwips: 16838,
  marginTwips: 1440,
  headerTwips: 708,
  footerTwips: 708,
} as const;

/** The width of the text area, in twips. */
export const TEXT_WIDTH_TWIPS = PAGE.widthTwips - 2 * PAGE.marginTwips;
