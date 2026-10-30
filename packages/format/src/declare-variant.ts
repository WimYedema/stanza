import { markAllowed, type StyleName, type VariantMark } from '@phrase/core';
import { isMap, isNode, isScalar, parseDocument, type Pair, type YAMLMap } from 'yaml';
import { parseStylesheet } from './stylesheet.js';

/**
 * What a variant is declared as. The fonts and colors of a project are not known here, so a code
 * variant has no properties: the mark is allowed, and the look of it is for the stylesheet to say.
 */
export const DEFAULT_VARIANTS: Readonly<Record<VariantMark, string>> = {
  strong: '{ bold: true }',
  emphasis: '{ italic: true }',
  link: '{ underline: true }',
  code: '{}',
};

export type DeclareVariantResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: 'invalid-stylesheet' | 'unknown-style' | 'unsupported-layout';
      readonly message: string;
    };

type Failure = Extract<DeclareVariantResult, { ok: false }>;
interface Edit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

type Range = readonly [number, number, number];

const failure = (code: Failure['code'], message: string): Failure => ({ ok: false, code, message });

const rangeOf = (node: unknown): Range | undefined =>
  isNode(node) ? (node.range ?? undefined) : undefined;

const keyOf = (pair: Pair): unknown => (isScalar(pair.key) ? pair.key.value : undefined);
const findPair = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((pair) => keyOf(pair) === key);

const lineStart = (text: string, pos: number): number =>
  pos === 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (text: string, pos: number): number => {
  const end = text.indexOf('\n', pos);
  return end === -1 ? text.length : end;
};
const columnOf = (text: string, pos: number): number => pos - lineStart(text, pos);

/** Where a pair ends: after its value, or after its key when it has no value. */
const endOf = (pair: Pair): number =>
  Math.max(rangeOf(pair.key)?.[1] ?? 0, rangeOf(pair.value)?.[1] ?? 0);

/** The insertion of `text` on a new line after the last pair of a block mapping. */
function appendTo(text: string, map: YAMLMap, line: (indent: string) => string): Edit | undefined {
  const first = map.items[0];
  const last = map.items.at(-1);
  const firstAt = first === undefined ? undefined : rangeOf(first.key)?.[0];
  if (last === undefined || firstAt === undefined) return undefined;
  const end = lineEnd(text, endOf(last));
  return { from: end, to: end, insert: `\n${line(' '.repeat(columnOf(text, firstAt)))}` };
}

function planEdit(text: string, entry: Pair, mark: VariantMark): Edit | Failure | undefined {
  const snippet = DEFAULT_VARIANTS[mark];
  const style = entry.value;
  const unsupported = failure(
    'unsupported-layout',
    `The stylesheet is laid out in a way that cannot be edited here. Add variants.${mark} to the style by hand.`,
  );
  if (!isMap(style)) return unsupported;
  const variantsPair = findPair(style, 'variants');

  if (variantsPair === undefined) {
    const declare = (indent: string): string =>
      `${indent}variants:\n${indent}  ${mark}: ${snippet}`;
    if (style.flow !== true) return appendTo(text, style, declare) ?? unsupported;
    // An empty `{}` is how a style with nothing to say is written.
    const keyAt = rangeOf(entry.key)?.[0];
    const at = rangeOf(style);
    if (style.items.length > 0 || keyAt === undefined || at === undefined) return unsupported;
    let from = at[0];
    while (text[from - 1] === ' ') from -= 1;
    const indent = ' '.repeat(columnOf(text, keyAt) + 2);
    return { from, to: at[1], insert: `\n${declare(indent)}` };
  }

  const variants = variantsPair.value;
  if (!isMap(variants) || variants.flow === true) return unsupported;
  const existing = findPair(variants, mark);
  if (existing === undefined) {
    return appendTo(text, variants, (indent) => `${indent}${mark}: ${snippet}`) ?? unsupported;
  }
  if (isMap(existing.value)) return undefined;
  const at = rangeOf(existing.value);
  if (isScalar(existing.value) && existing.value.value === false && at !== undefined) {
    return { from: at[0], to: at[1], insert: snippet };
  }
  return unsupported;
}

/**
 * Declares a variant on a paragraph style of a stylesheet, so that the style allows the mark. Only
 * the lines of that style change: the text is edited where the style is, and the rest, with its
 * comments, is kept as it is. A variant that is switched off with `false` is replaced, and one that
 * is declared already leaves the text as it was.
 */
export function declareVariant(
  source: string,
  style: StyleName,
  mark: VariantMark,
): DeclareVariantResult {
  const crlf = source.includes('\r\n');
  const text = crlf ? source.replaceAll('\r\n', '\n') : source;
  const document = parseDocument(text);
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
  const edit = planEdit(text, entry, mark);
  if (edit === undefined) return { ok: true, text: source };
  if ('ok' in edit) return edit;

  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  const parsed = parseStylesheet(next);
  if (
    parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ||
    !markAllowed(parsed.stylesheet, style, mark)
  ) {
    return failure(
      'unsupported-layout',
      `Declaring ${mark} would not give a valid stylesheet. Add variants.${mark} to the style by hand.`,
    );
  }
  return { ok: true, text: crlf ? next.replaceAll('\n', '\r\n') : next };
}
