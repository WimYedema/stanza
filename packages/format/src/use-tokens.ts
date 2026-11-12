import { parseDocument } from 'yaml';
import { setProperty } from './edit-stylesheet.js';
import { parseStylesheet } from './stylesheet.js';

export type UseTokensResult =
  | {
      readonly ok: true;
      readonly text: string;
      /** The values in styles that now name a token. */
      readonly moved: number;
      /** The tokens that were added for them; a value that has a token uses it. */
      readonly added: number;
    }
  | {
      readonly ok: false;
      readonly code: 'invalid-stylesheet' | 'unsupported-layout' | 'invalid-result';
      readonly message: string;
    };

type Failure = Extract<UseTokensResult, { ok: false }>;

const failure = (code: Failure['code'], message: string): Failure => ({ ok: false, code, message });

const lookup = (data: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null && !Array.isArray(node)
        ? (node as Record<string, unknown>)[key]
        : undefined,
    data,
  );

/** A name that is not taken: the wanted one, or with a number after it. */
function freeName(wanted: string, taken: ReadonlySet<string>): string {
  let name = wanted;
  for (let n = 2; taken.has(name); n += 1) name = `${wanted}-${String(n)}`;
  return name;
}

const colorName = (hex: string): string => `color-${hex.slice(1).toLowerCase()}`;
const fontName = (families: readonly string[]): string => {
  const slug = families
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === '' ? 'font' : `font-${slug}`;
};

/**
 * Moves the hex colors and font lists of the styles into tokens (ADR 0074), the repair for the
 * errors `raw-color` and `raw-font` (ADR 0065). A value that equals a token uses that token. Any
 * other gets a token named after the value (`color-f2f2f2`, `font-calibri-arial`), for the author
 * to rename. It is `setProperty` for each token and each value (ADR 0035), so the comments and the
 * layout of the file stay. Nothing is changed unless every value can be moved, and a stylesheet
 * with no raw value is given back as it was.
 */
export function moveValuesToTokens(source: string): UseTokensResult {
  const document = parseDocument(source.replaceAll('\r\n', '\n'));
  if (document.errors.length > 0) {
    return failure(
      'invalid-stylesheet',
      'The stylesheet is not valid YAML, so it was not changed.',
    );
  }
  const { stylesheet, diagnostics } = parseStylesheet(source);
  const raw = diagnostics.filter(
    (diagnostic) =>
      (diagnostic.code === 'raw-color' || diagnostic.code === 'raw-font') &&
      diagnostic.path !== undefined,
  );
  const data: unknown = document.toJS();

  const colors = new Map(stylesheet.tokens.colors);
  const fonts = new Map(stylesheet.tokens.fonts);
  const added: { path: string[]; value: string | string[] }[] = [];
  const uses: { path: string[]; name: string }[] = [];

  for (const { code, path } of raw) {
    const keys = (path ?? '').split('.');
    const value = lookup(data, keys);
    if (code === 'raw-color' && typeof value === 'string') {
      const hex = value.toUpperCase();
      let name = [...colors].find(([, same]) => same === hex)?.[0];
      if (name === undefined) {
        name = freeName(colorName(hex), new Set(colors.keys()));
        colors.set(name, hex);
        added.push({ path: ['tokens', 'colors', name], value: hex });
      }
      uses.push({ path: keys, name });
    } else if (code === 'raw-font' && Array.isArray(value)) {
      const families = value as string[];
      const list = families.join('\u0000');
      let name = [...fonts].find(([, same]) => same.join('\u0000') === list)?.[0];
      if (name === undefined) {
        name = freeName(fontName(families), new Set(fonts.keys()));
        fonts.set(name, families);
        added.push({ path: ['tokens', 'fonts', name], value: families });
      }
      uses.push({ path: keys, name });
    } else {
      return failure(
        'unsupported-layout',
        `The value at ${path ?? ''} cannot be moved here. Add a token for it by hand.`,
      );
    }
  }

  let text = source;
  for (const edit of [...added, ...uses.map(({ path, name }) => ({ path, value: name }))]) {
    const next = setProperty(text, edit.path, edit.value);
    if (!next.ok) {
      return failure(
        next.code === 'invalid-stylesheet' || next.code === 'invalid-result'
          ? next.code
          : 'unsupported-layout',
        next.code === 'unsupported-layout'
          ? `The stylesheet is laid out in a way that cannot be edited here (${edit.path.join('.')}). Move the values into tokens by hand.`
          : next.message,
      );
    }
    text = next.text;
  }
  if (
    parseStylesheet(text).diagnostics.some((d) => d.code === 'raw-color' || d.code === 'raw-font')
  ) {
    return failure('invalid-result', 'Some values are still not tokens. Move them by hand.');
  }
  return { ok: true, text, moved: uses.length, added: added.length };
}
