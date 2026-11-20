import { markAllowed, type StyleName, type VariantMark } from '@stanza/core';
import { isMap, parseDocument } from 'yaml';
import { findPair, setProperty, type YamlValue } from './edit-stylesheet.js';
import { parseStylesheet } from './stylesheet.js';

/**
 * What a variant is declared as. The fonts and colors of a project are not known here, so a code
 * variant has no properties: the mark is allowed, and the look of it is for the stylesheet to say.
 */
export const DEFAULT_VARIANTS: Readonly<Record<VariantMark, YamlValue>> = {
  strong: { bold: true },
  emphasis: { italic: true },
  link: { underline: true },
  code: {},
};

export type DeclareVariantResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: 'invalid-stylesheet' | 'unknown-style' | 'unsupported-layout';
      readonly message: string;
    };

type Failure = Extract<DeclareVariantResult, { ok: false }>;

const failure = (code: Failure['code'], message: string): Failure => ({ ok: false, code, message });

/**
 * Declares a variant on a paragraph style of a stylesheet, so that the style allows the mark. It is
 * `setProperty` of `variants.<mark>` (ADR 0035), so only the lines of that style change and the
 * rest, with its comments, is kept. A variant that is switched off with `false` is replaced, and one
 * that is declared already leaves the text as it was.
 */
export function declareVariant(
  source: string,
  style: StyleName,
  mark: VariantMark,
): DeclareVariantResult {
  const document = parseDocument(source.replaceAll('\r\n', '\n'));
  if (document.errors.length > 0) {
    return failure(
      'invalid-stylesheet',
      'The stylesheet is not valid YAML, so it was not changed.',
    );
  }
  const styles = document.get('paragraph-styles', true);
  const entry = isMap(styles) ? findPair(styles, style) : undefined;
  if (entry === undefined) {
    return failure('unknown-style', `The stylesheet has no paragraph style "${style}".`);
  }
  const variants = isMap(entry.value) ? findPair(entry.value, 'variants')?.value : undefined;
  if (isMap(variants) && isMap(findPair(variants, mark)?.value)) return { ok: true, text: source };

  const by = `Add variants.${mark} to the style by hand.`;
  const edited = setProperty(
    source,
    ['paragraph-styles', style, 'variants', mark],
    DEFAULT_VARIANTS[mark],
  );
  if (!edited.ok) {
    return edited.code === 'invalid-stylesheet'
      ? failure('invalid-stylesheet', edited.message)
      : failure(
          'unsupported-layout',
          edited.code === 'unsupported-layout'
            ? `The stylesheet is laid out in a way that cannot be edited here. ${by}`
            : `Declaring ${mark} would not give a valid stylesheet. ${by}`,
        );
  }
  if (!markAllowed(parseStylesheet(edited.text).stylesheet, style, mark)) {
    return failure(
      'unsupported-layout',
      `Declaring ${mark} would not give a valid stylesheet. ${by}`,
    );
  }
  return edited;
}
