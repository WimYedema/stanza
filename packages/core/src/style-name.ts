declare const styleNameBrand: unique symbol;

/** Name of a style declared by the stylesheet: kebab-case, such as `cover-title`. */
export type StyleName = string & { readonly [styleNameBrand]: true };

const STYLE_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isStyleName(value: string): value is StyleName {
  return STYLE_NAME_PATTERN.test(value);
}
