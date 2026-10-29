import { isStyleName, type StyleName } from './style-name.js';

function styleName(value: string): StyleName {
  if (!isStyleName(value)) throw new Error(`Invalid style name "${value}".`);
  return value;
}

/** The styles that blocks without a `style` use (ADR 0006). */
export const BODY_STYLE = styleName('body');
export const CODE_STYLE = styleName('code');
export const LIST_STYLES = {
  bulleted: styleName('list-bulleted'),
  numbered: styleName('list-numbered'),
};

const HEADING_STYLES = [1, 2, 3, 4, 5, 6].map((level) => styleName(`heading-${String(level)}`));

export function defaultHeadingStyle(level: number): StyleName {
  return HEADING_STYLES[level - 1] ?? BODY_STYLE;
}
