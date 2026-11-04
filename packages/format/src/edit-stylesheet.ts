import { isMap, isNode, isScalar, isSeq, parseDocument, type Pair, type YAMLMap } from 'yaml';
import { parseStylesheet } from './stylesheet.js';

/**
 * Edits of the text of a stylesheet that keep everything else as it is (ADR 0035): a property is
 * set or removed by its path, the lines around it, with their comments, are not touched, and the
 * result must not have errors that the text did not have. The text is edited where the property
 * is, using the positions that the `yaml` library gives for the nodes. It is not written again.
 */

/** A value that can be written on one line: a word, a number, a flag, a list of words or a mapping. */
export type YamlValue =
  string | number | boolean | readonly string[] | { readonly [key: string]: YamlValue };

export type EditFailure = {
  readonly ok: false;
  readonly code:
    | 'invalid-stylesheet'
    | 'invalid-path'
    | 'invalid-value'
    | 'unsupported-layout'
    | 'invalid-result';
  readonly message: string;
};

export type StylesheetEdit = { readonly ok: true; readonly text: string } | EditFailure;

class Refusal extends Error {
  constructor(
    readonly code: EditFailure['code'],
    message: string,
  ) {
    super(message);
  }
}

interface Edit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

type Range = readonly [number, number, number];

const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PLAIN = /^[A-Za-z][A-Za-z0-9-]*$/;
/** Words that YAML reads as something other than text, so they are quoted. */
const YAML_WORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n']);

const rangeOf = (node: unknown): Range | undefined =>
  isNode(node) ? (node.range ?? undefined) : undefined;

const keyOf = (pair: Pair): unknown => (isScalar(pair.key) ? pair.key.value : undefined);

export const findPair = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((pair) => keyOf(pair) === key);

const lineStart = (text: string, pos: number): number =>
  pos === 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (text: string, pos: number): number => {
  const end = text.indexOf('\n', pos);
  return end === -1 ? text.length : end;
};
const columnOf = (text: string, pos: number): number => pos - lineStart(text, pos);

/**
 * Where a pair ends: after its value, or after its key when it has no value. A block mapping's own
 * range runs on over the blank lines after it, so its end is that of its last pair.
 */
const endOf = (pair: Pair): number => {
  const value = pair.value;
  const inner = isMap(value) && value.flow !== true ? value.items.at(-1) : undefined;
  const valueEnd = inner === undefined ? (rangeOf(value)?.[1] ?? 0) : endOf(inner);
  return Math.max(rangeOf(pair.key)?.[1] ?? 0, valueEnd);
};

const hasControl = (text: string): boolean =>
  Array.from(text).some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);

const quoted = (text: string): string => {
  if (hasControl(text)) throw new Refusal('invalid-value', 'A value cannot contain a line break.');
  return `'${text.replaceAll("'", "''")}'`;
};

function scalarText(value: string | number | boolean): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Refusal('invalid-value', 'A number must be finite.');
    return String(value);
  }
  return PLAIN.test(value) && !YAML_WORDS.has(value.toLowerCase()) ? value : quoted(value);
}

/** The value as it is written in this project: on one line, with flow brackets and braces. */
function flowText(value: YamlValue): string {
  if (typeof value !== 'object') return scalarText(value);
  if (Array.isArray(value)) return `[${(value as readonly string[]).map(quoted).join(', ')}]`;
  const entries = Object.entries(value as { readonly [key: string]: YamlValue });
  if (entries.length === 0) return '{}';
  const items = entries.map(([key, inner]) => {
    if (!KEY.test(key)) throw new Refusal('invalid-value', `"${key}" is not a property name.`);
    return `${key}: ${flowText(inner)}`;
  });
  return `{ ${items.join(', ')} }`;
}

/** `a: { b: value }` for the keys that do not exist yet, written on one line for a flow mapping. */
function nestedFlow(keys: readonly string[], value: YamlValue): string {
  const [first = '', ...rest] = keys;
  const inner = rest.reduceRight<YamlValue>((deeper, key) => ({ [key]: deeper }), value);
  return `${first}: ${flowText(inner)}`;
}

/** `a:` and the lines below it for the keys that do not exist yet, in a block mapping. */
function blockLines(indent: string, keys: readonly string[], value: YamlValue): string {
  return keys
    .map((key, depth) => {
      const pad = `${indent}${'  '.repeat(depth)}`;
      return depth === keys.length - 1 ? `${pad}${key}: ${flowText(value)}` : `${pad}${key}:`;
    })
    .join('\n');
}

/** The insertion of lines after the last pair of a block mapping, with the indentation of its keys. */
function appendTo(text: string, map: YAMLMap, lines: (indent: string) => string): Edit {
  const first = map.items[0];
  const last = map.items.at(-1);
  const firstAt = first === undefined ? undefined : rangeOf(first.key)?.[0];
  if (last === undefined || firstAt === undefined) throw layout();
  const end = lineEnd(text, endOf(last));
  return { from: end, to: end, insert: `\n${lines(' '.repeat(columnOf(text, firstAt)))}` };
}

const layout = (): Refusal =>
  new Refusal(
    'unsupported-layout',
    'The stylesheet is laid out in a way that cannot be edited here.',
  );

interface Level {
  readonly map: YAMLMap;
  /** The pair whose value is the mapping; the root has none. */
  readonly owner: Pair | undefined;
}

/** Adds `keys` (the first one is new) to the mapping of level `at`. */
function insertKeys(
  text: string,
  levels: readonly Level[],
  at: number,
  keys: readonly string[],
  value: YamlValue,
): Edit {
  const level = levels[at];
  if (level === undefined) throw layout();
  const { map, owner } = level;
  if (map.flow === true && map.items.length > 0) {
    const last = map.items.at(-1);
    if (last === undefined) throw layout();
    const end = endOf(last);
    return { from: end, to: end, insert: `, ${nestedFlow(keys, value)}` };
  }
  if (map.items.length === 0) {
    const where = rangeOf(map);
    const container = levels[at - 1];
    const keyAt = owner === undefined ? undefined : rangeOf(owner.key)?.[0];
    if (where === undefined || owner === undefined || container === undefined) throw layout();
    if (container.map.flow === true) {
      return { from: where[0], to: where[1], insert: `{ ${nestedFlow(keys, value)} }` };
    }
    // An empty `{}` is how a style with nothing to say is written: it becomes a block.
    if (keyAt === undefined) throw layout();
    let from = where[0];
    while (text[from - 1] === ' ') from -= 1;
    const indent = ' '.repeat(columnOf(text, keyAt) + 2);
    return { from, to: where[1], insert: `\n${blockLines(indent, keys, value)}` };
  }
  return appendTo(text, map, (indent) => blockLines(indent, keys, value));
}

/** Replaces the value of a pair that has one that can be replaced where it stands. */
function replaceValue(text: string, pair: Pair, value: YamlValue): Edit[] {
  const current = pair.value;
  const where = rangeOf(current);
  const replaceable =
    where !== undefined &&
    ((isScalar(current) && current.value !== null && !String(current.type).startsWith('BLOCK')) ||
      ((isMap(current) || isSeq(current)) && current.flow === true));
  if (!replaceable) throw layout();
  const next = flowText(value);
  if (text.slice(where[0], where[1]) === next) return [];
  return [{ from: where[0], to: where[1], insert: next }];
}

function planSet(
  text: string,
  root: YAMLMap,
  path: readonly string[],
  value: YamlValue,
): readonly Edit[] {
  const levels: Level[] = [{ map: root, owner: undefined }];
  for (const [index, key] of path.entries()) {
    const level = levels[index];
    const pair = level === undefined ? undefined : findPair(level.map, key);
    if (pair === undefined) return [insertKeys(text, levels, index, path.slice(index), value)];
    if (index === path.length - 1) return replaceValue(text, pair, value);
    if (!isMap(pair.value)) throw layout();
    levels.push({ map: pair.value, owner: pair });
  }
  throw new Refusal('invalid-path', 'A property needs a path.');
}

/** The lines of a pair, with the comment that ends them, and the line break before the end of the file. */
function removeLines(text: string, pair: Pair): Edit {
  const keyAt = rangeOf(pair.key)?.[0];
  if (keyAt === undefined) throw layout();
  const start = lineStart(text, keyAt);
  if (text.slice(start, keyAt).trim() !== '') throw layout();
  const end = lineEnd(text, endOf(pair));
  if (end < text.length) return { from: start, to: end + 1, insert: '' };
  return { from: Math.max(0, start - 1), to: end, insert: '' };
}

/** A mapping that has lost its last pair is `{}`, which is how an empty style is written. */
function emptied(text: string, owner: Pair, map: YAMLMap): Edit[] {
  const where = rangeOf(map);
  const child = map.items[0];
  if (where === undefined || child === undefined) throw layout();
  if (map.flow === true) return [{ from: where[0], to: where[1], insert: '{}' }];
  const colon = rangeOf(owner.key)?.[1];
  if (colon === undefined || text[colon] !== ':') throw layout();
  return [{ from: colon + 1, to: colon + 1, insert: ' {}' }, removeLines(text, child)];
}

function removeAt(
  text: string,
  maps: readonly YAMLMap[],
  pairs: readonly Pair[],
  level: number,
): Edit[] {
  const map = maps[level];
  const pair = pairs[level];
  if (map === undefined || pair === undefined) throw layout();
  if (map.items.length === 1 && level >= 1) {
    // Below a style, a mapping with nothing left goes too. A style or a section becomes `{}`.
    const owner = pairs[level - 1];
    if (level >= 3) return removeAt(text, maps, pairs, level - 1);
    if (owner === undefined) throw layout();
    return emptied(text, owner, map);
  }
  if (map.flow !== true) return [removeLines(text, pair)];
  const index = map.items.indexOf(pair);
  const next = map.items[index + 1];
  const before = map.items[index - 1];
  const from = rangeOf(pair.key)?.[0];
  if (next !== undefined && from !== undefined) {
    const to = rangeOf(next.key)?.[0];
    if (to !== undefined) return [{ from, to, insert: '' }];
  }
  if (before !== undefined) return [{ from: endOf(before), to: endOf(pair), insert: '' }];
  throw layout();
}

function planUnset(text: string, root: YAMLMap, path: readonly string[]): readonly Edit[] {
  const maps: YAMLMap[] = [root];
  const pairs: Pair[] = [];
  for (const [index, key] of path.entries()) {
    const map = maps[index];
    const pair = map === undefined ? undefined : findPair(map, key);
    // A property that is not there is already as it should be.
    if (pair === undefined) return [];
    pairs.push(pair);
    if (index < path.length - 1) {
      if (!isMap(pair.value)) return [];
      maps.push(pair.value);
    }
  }
  return removeAt(text, maps, pairs, pairs.length - 1);
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.from - a.from);
  let result = text;
  let limit = text.length;
  for (const edit of ordered) {
    if (edit.to > limit) throw layout();
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
    limit = edit.from;
  }
  return result;
}

const errorsOf = (text: string): { key: string; message: string; path: string | undefined }[] =>
  parseStylesheet(text)
    .diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => ({
      key: [diagnostic.code, diagnostic.path ?? '', diagnostic.message].join('\u0000'),
      message: diagnostic.message,
      path: diagnostic.path,
    }));

function edit(
  source: string,
  path: readonly string[],
  plan: (text: string, root: YAMLMap) => readonly Edit[],
): StylesheetEdit {
  const crlf = source.includes('\r\n');
  const text = crlf ? source.replaceAll('\r\n', '\n') : source;
  try {
    if (path.length === 0 || !path.every((key) => KEY.test(key))) {
      throw new Refusal('invalid-path', 'A path is made of property names in kebab-case.');
    }
    const document = parseDocument(text);
    if (document.errors.length > 0) {
      throw new Refusal(
        'invalid-stylesheet',
        'The stylesheet is not valid YAML, so it was not changed.',
      );
    }
    const root = document.contents;
    if (!isMap(root)) throw layout();
    const edits = plan(text, root);
    if (edits.length === 0) return { ok: true, text: source };
    const next = applyEdits(text, edits);
    const known = new Set(errorsOf(text).map((error) => error.key));
    const added = errorsOf(next).find((error) => !known.has(error.key));
    if (added !== undefined) {
      const where = added.path === undefined ? '' : ` [${added.path}]`;
      throw new Refusal(
        'invalid-result',
        `The change would make the stylesheet invalid: ${added.message}${where}`,
      );
    }
    return { ok: true, text: crlf ? next.replaceAll('\n', '\r\n') : next };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/**
 * Sets a property of a stylesheet by its path, such as `paragraph-styles`, `body`, `size`. A
 * property that is there has its value replaced where it stands, so a comment after it stays. One
 * that is not there is added after the last line of its mapping, or inside the braces of a mapping
 * written on one line, and the mappings that are missing on the way are made. A style written as an
 * empty `{}` becomes a block. The result is refused if it has an error that the text did not have.
 */
export function setProperty(
  source: string,
  path: readonly string[],
  value: YamlValue,
): StylesheetEdit {
  return edit(source, path, (text, root) => planSet(text, root, path, value));
}

/**
 * Removes a property of a stylesheet by its path. The lines of the property go with the comment
 * that ends them, and the comments above stay. A mapping below a style that has nothing left goes
 * too, and a style or a section that has nothing left is written `{}`. A property that is not there
 * leaves the text as it was.
 */
export function unsetProperty(source: string, path: readonly string[]): StylesheetEdit {
  return edit(source, path, (text, root) => planUnset(text, root, path));
}
