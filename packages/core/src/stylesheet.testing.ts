import {
  DEFAULT_TABLE_OF_CONTENTS,
  RESERVED_PARAGRAPH_STYLES,
  RESERVED_TABLE_STYLE,
  type CharacterStyle,
  type PageTemplate,
  type ParagraphStyle,
  type Stylesheet,
  type TableStyle,
} from './stylesheet.js';
import { isStyleName, type StyleName } from './style-name.js';

/** Helpers for tests that need a stylesheet. Not part of the package. */

export function n(value: string): StyleName {
  if (!isStyleName(value)) throw new Error(`invalid style name ${value}`);
  return value;
}

export const plainStyle: ParagraphStyle = { text: {}, paragraph: {}, variants: {} };

export interface Parts {
  /** A style set to undefined is removed. */
  readonly paragraph?: Record<string, ParagraphStyle | undefined>;
  readonly character?: Record<string, CharacterStyle>;
  readonly table?: Record<string, TableStyle>;
  readonly pageTemplates?: Record<string, PageTemplate>;
  readonly colors?: Record<string, string>;
  readonly fonts?: Record<string, readonly string[]>;
}

/** A stylesheet that has every reserved style, with the given parts on top. */
export function sheet(parts: Parts = {}): Stylesheet {
  const paragraph = new Map<StyleName, ParagraphStyle>(
    RESERVED_PARAGRAPH_STYLES.map((name) => [name, plainStyle]),
  );
  for (const [name, style] of Object.entries(parts.paragraph ?? {})) {
    if (style === undefined) paragraph.delete(n(name));
    else paragraph.set(n(name), style);
  }
  const table = new Map<StyleName, TableStyle>([[RESERVED_TABLE_STYLE, {}]]);
  for (const [name, style] of Object.entries(parts.table ?? {})) table.set(n(name), style);
  return {
    tokens: {
      colors: new Map(Object.entries(parts.colors ?? {})),
      fonts: new Map(Object.entries(parts.fonts ?? {})),
    },
    paragraphStyles: paragraph,
    characterStyles: new Map(
      Object.entries(parts.character ?? {}).map(([name, style]) => [n(name), style]),
    ),
    tableStyles: table,
    tableOfContents: DEFAULT_TABLE_OF_CONTENTS,
    pageTemplates: new Map(
      Object.entries(parts.pageTemplates ?? {}).map(([name, template]) => [n(name), template]),
    ),
  };
}
