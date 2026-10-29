import {
  isStyleName,
  validateStylesheet,
  VARIANT_MARKS,
  type Alignment,
  type Border,
  type CharacterStyle,
  type ColorValue,
  type Diagnostic,
  type FontValue,
  type HeaderRow,
  type LineSpacing,
  type ParagraphProps,
  type ParagraphStyle,
  type StyleName,
  type Stylesheet,
  type TableBorders,
  type TableStyle,
  type TextProps,
  type VariantDeclaration,
  type VariantMark,
} from '@phrase/core';
import { parseDocument } from 'yaml';
import { FORMAT_VERSION } from './front-matter.js';

export interface StylesheetParseResult {
  readonly stylesheet: Stylesheet;
  readonly diagnostics: readonly Diagnostic[];
  /** The `phrase-format` value found in the file, when there was one. */
  readonly formatVersion: number | undefined;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Report = (code: string, message: string, path: string) => void;
type Data = Readonly<Record<string, unknown>>;

const TEXT_KEYS = ['font', 'size', 'bold', 'italic', 'underline', 'color', 'highlight'] as const;
const PARAGRAPH_KEYS = [
  'space-before',
  'space-after',
  'line-spacing',
  'indent-left',
  'first-line-indent',
  'alignment',
  'keep-with-next',
  'keep-together',
  'page-break-before',
  'background',
] as const;
const ALIGNMENTS: readonly string[] = ['left', 'center', 'right', 'justify'];
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const EMPTY: Stylesheet = {
  tokens: { colors: new Map(), fonts: new Map() },
  paragraphStyles: new Map(),
  characterStyles: new Map(),
  tableStyles: new Map(),
};

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function describe(value: unknown): string {
  if (value === null || value === undefined) {
    return 'nothing (a `#` starts a comment in YAML, so quote color values)';
  }
  return Array.isArray(value) ? 'a list' : typeof value;
}

function asMap(value: unknown, path: string, report: Report): Data | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Data;
  }
  report('invalid-type', `Expected a mapping, found ${describe(value)}.`, path);
  return undefined;
}

function checkKeys(map: Data, allowed: readonly string[], path: string, report: Report): void {
  for (const key of Object.keys(map)) {
    if (!allowed.includes(key)) {
      report('unknown-property', `Unknown property "${key}".`, join(path, key));
    }
  }
}

function readNumber(map: Data, key: string, path: string, report: Report): number | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  report('invalid-type', `Expected a number, found ${describe(value)}.`, join(path, key));
  return undefined;
}

function readBoolean(map: Data, key: string, path: string, report: Report): boolean | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  report('invalid-type', `Expected true or false, found ${describe(value)}.`, join(path, key));
  return undefined;
}

function readName(map: Data, key: string, path: string, report: Report): StyleName | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && isStyleName(value)) return value;
  report('invalid-value', 'Expected a kebab-case style name.', join(path, key));
  return undefined;
}

function colorOf(value: unknown, path: string, report: Report): ColorValue | undefined {
  if (typeof value === 'string' && HEX_COLOR.test(value)) {
    return { kind: 'hex', hex: value.toUpperCase() };
  }
  if (typeof value === 'string' && KEBAB_CASE.test(value)) return { kind: 'token', name: value };
  report(
    'invalid-type',
    `Expected a #RRGGBB color or a color token name, found ${describe(value)}.`,
    path,
  );
  return undefined;
}

function readColor(map: Data, key: string, path: string, report: Report): ColorValue | undefined {
  return map[key] === undefined ? undefined : colorOf(map[key], join(path, key), report);
}

function isNonEmptyStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
  );
}

function isAlignment(value: unknown): value is Alignment {
  return typeof value === 'string' && ALIGNMENTS.includes(value);
}

function readFont(map: Data, key: string, path: string, report: Report): FontValue | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && KEBAB_CASE.test(value)) return { kind: 'token', name: value };
  if (isNonEmptyStringList(value)) return { kind: 'families', families: value };
  report(
    'invalid-type',
    `Expected a font token name or a list of family names, found ${describe(value)}.`,
    join(path, key),
  );
  return undefined;
}

function readText(map: Data, path: string, report: Report): TextProps {
  const props: Mutable<TextProps> = {};
  const font = readFont(map, 'font', path, report);
  if (font !== undefined) props.font = font;
  const size = readNumber(map, 'size', path, report);
  if (size !== undefined) props.sizePt = size;
  const bold = readBoolean(map, 'bold', path, report);
  if (bold !== undefined) props.bold = bold;
  const italic = readBoolean(map, 'italic', path, report);
  if (italic !== undefined) props.italic = italic;
  const underline = readBoolean(map, 'underline', path, report);
  if (underline !== undefined) props.underline = underline;
  const color = readColor(map, 'color', path, report);
  if (color !== undefined) props.color = color;
  const highlight = readColor(map, 'highlight', path, report);
  if (highlight !== undefined) props.highlight = highlight;
  return props;
}

function readLineSpacing(map: Data, path: string, report: Report): LineSpacing | undefined {
  if (map['line-spacing'] === undefined) return undefined;
  const here = join(path, 'line-spacing');
  const spacing = asMap(map['line-spacing'], here, report);
  if (spacing === undefined) return undefined;
  checkKeys(spacing, ['at-least', 'exactly', 'multiple'], here, report);
  const atLeast = readNumber(spacing, 'at-least', here, report);
  const exactly = readNumber(spacing, 'exactly', here, report);
  const multiple = readNumber(spacing, 'multiple', here, report);
  const given = [atLeast, exactly, multiple].filter((value) => value !== undefined);
  if (given.length !== 1) {
    report('invalid-value', 'Give exactly one of at-least, exactly, or multiple.', here);
    return undefined;
  }
  if (atLeast !== undefined) return { rule: 'at-least', pt: atLeast };
  if (exactly !== undefined) return { rule: 'exactly', pt: exactly };
  return multiple === undefined ? undefined : { rule: 'multiple', factor: multiple };
}

function readParagraph(map: Data, path: string, report: Report): ParagraphProps {
  const props: Mutable<ParagraphProps> = {};
  const before = readNumber(map, 'space-before', path, report);
  if (before !== undefined) props.spaceBeforePt = before;
  const after = readNumber(map, 'space-after', path, report);
  if (after !== undefined) props.spaceAfterPt = after;
  const lineSpacing = readLineSpacing(map, path, report);
  if (lineSpacing !== undefined) props.lineSpacing = lineSpacing;
  const indent = readNumber(map, 'indent-left', path, report);
  if (indent !== undefined) props.indentLeftPt = indent;
  const firstLine = readNumber(map, 'first-line-indent', path, report);
  if (firstLine !== undefined) props.firstLineIndentPt = firstLine;
  const alignment = map['alignment'];
  if (alignment !== undefined) {
    if (isAlignment(alignment)) props.alignment = alignment;
    else {
      report('invalid-value', 'Expected left, center, right, or justify.', join(path, 'alignment'));
    }
  }
  const keepWithNext = readBoolean(map, 'keep-with-next', path, report);
  if (keepWithNext !== undefined) props.keepWithNext = keepWithNext;
  const keepTogether = readBoolean(map, 'keep-together', path, report);
  if (keepTogether !== undefined) props.keepTogether = keepTogether;
  const pageBreak = readBoolean(map, 'page-break-before', path, report);
  if (pageBreak !== undefined) props.pageBreakBefore = pageBreak;
  const background = readColor(map, 'background', path, report);
  if (background !== undefined) props.background = background;
  return props;
}

function readVariants(
  map: Data,
  path: string,
  report: Report,
): Readonly<Partial<Record<VariantMark, VariantDeclaration>>> {
  const variants: Partial<Record<VariantMark, VariantDeclaration>> = {};
  if (map['variants'] === undefined) return variants;
  const here = join(path, 'variants');
  const declared = asMap(map['variants'], here, report);
  if (declared === undefined) return variants;
  checkKeys(declared, VARIANT_MARKS, here, report);
  for (const mark of VARIANT_MARKS) {
    const value = declared[mark];
    if (value === undefined) continue;
    if (value === false) {
      variants[mark] = null;
      continue;
    }
    const props = asMap(value, join(here, mark), report);
    if (props === undefined) continue;
    checkKeys(props, TEXT_KEYS, join(here, mark), report);
    variants[mark] = readText(props, join(here, mark), report);
  }
  return variants;
}

function readParagraphStyle(map: Data, path: string, report: Report): ParagraphStyle {
  checkKeys(map, ['based-on', ...TEXT_KEYS, ...PARAGRAPH_KEYS, 'variants'], path, report);
  const basedOn = readName(map, 'based-on', path, report);
  return {
    ...(basedOn !== undefined ? { basedOn } : {}),
    text: readText(map, path, report),
    paragraph: readParagraph(map, path, report),
    variants: readVariants(map, path, report),
  };
}

function readCharacterStyle(map: Data, path: string, report: Report): CharacterStyle {
  checkKeys(map, ['based-on', ...TEXT_KEYS], path, report);
  const basedOn = readName(map, 'based-on', path, report);
  return { ...(basedOn !== undefined ? { basedOn } : {}), text: readText(map, path, report) };
}

function readBorder(map: Data, key: string, path: string, report: Report): Border | undefined {
  if (map[key] === undefined) return undefined;
  const here = join(path, key);
  const border = asMap(map[key], here, report);
  if (border === undefined) return undefined;
  checkKeys(border, ['width', 'color'], here, report);
  const widthPt = readNumber(border, 'width', here, report);
  const color = readColor(border, 'color', here, report);
  if (widthPt === undefined || color === undefined) {
    if (widthPt === undefined && border['width'] === undefined) {
      report('missing-property', 'A border needs a width.', join(here, 'width'));
    }
    if (color === undefined && border['color'] === undefined) {
      report('missing-property', 'A border needs a color.', join(here, 'color'));
    }
    return undefined;
  }
  return { widthPt, color };
}

function readTableStyle(map: Data, path: string, report: Report): TableStyle {
  checkKeys(map, ['based-on', 'border', 'header-row', 'cell-padding'], path, report);
  const style: Mutable<TableStyle> = {};
  const basedOn = readName(map, 'based-on', path, report);
  if (basedOn !== undefined) style.basedOn = basedOn;

  if (map['border'] !== undefined) {
    const here = join(path, 'border');
    const borders = asMap(map['border'], here, report);
    if (borders !== undefined) {
      checkKeys(borders, ['outer', 'inside-horizontal', 'inside-vertical'], here, report);
      const result: Mutable<TableBorders> = {};
      const outer = readBorder(borders, 'outer', here, report);
      if (outer !== undefined) result.outer = outer;
      const horizontal = readBorder(borders, 'inside-horizontal', here, report);
      if (horizontal !== undefined) result.insideHorizontal = horizontal;
      const vertical = readBorder(borders, 'inside-vertical', here, report);
      if (vertical !== undefined) result.insideVertical = vertical;
      style.border = result;
    }
  }

  if (map['header-row'] !== undefined) {
    const here = join(path, 'header-row');
    const row = asMap(map['header-row'], here, report);
    if (row !== undefined) {
      checkKeys(row, [...TEXT_KEYS, 'background', 'repeat'], here, report);
      const header: Mutable<HeaderRow> = { text: readText(row, here, report) };
      const background = readColor(row, 'background', here, report);
      if (background !== undefined) header.background = background;
      const repeat = readBoolean(row, 'repeat', here, report);
      if (repeat !== undefined) header.repeat = repeat;
      style.headerRow = header;
    }
  }

  const padding = readNumber(map, 'cell-padding', path, report);
  if (padding !== undefined) style.cellPaddingPt = padding;
  return style;
}

/** Reads every entry of a section, keyed by style name, and decodes each with `read`. */
function readSection<T>(
  data: Data,
  section: string,
  read: (map: Data, path: string) => T,
  report: Report,
): Map<StyleName, T> {
  const result = new Map<StyleName, T>();
  if (data[section] === undefined) return result;
  const entries = asMap(data[section], section, report);
  if (entries === undefined) return result;
  for (const [name, value] of Object.entries(entries)) {
    const path = join(section, name);
    if (!isStyleName(name)) {
      report('invalid-name', `"${name}" is not a kebab-case name.`, path);
      continue;
    }
    // A style with no properties is written as an empty mapping or left empty.
    const map = value === null ? {} : asMap(value, path, report);
    if (map !== undefined) result.set(name, read(map, path));
  }
  return result;
}

/** The entries of one token section whose names are valid, with their paths. */
function tokenEntries(
  tokens: Data,
  kind: 'colors' | 'fonts',
  report: Report,
): [string, unknown, string][] {
  if (tokens[kind] === undefined) return [];
  const base = join('tokens', kind);
  const entries = asMap(tokens[kind], base, report);
  if (entries === undefined) return [];
  const result: [string, unknown, string][] = [];
  for (const [name, value] of Object.entries(entries)) {
    if (KEBAB_CASE.test(name)) result.push([name, value, join(base, name)]);
    else report('invalid-name', `"${name}" is not a kebab-case name.`, join(base, name));
  }
  return result;
}

function readTokens(data: Data, report: Report): Stylesheet['tokens'] {
  const colors = new Map<string, string>();
  const fonts = new Map<string, readonly string[]>();
  if (data['tokens'] === undefined) return { colors, fonts };
  const tokens = asMap(data['tokens'], 'tokens', report);
  if (tokens === undefined) return { colors, fonts };
  checkKeys(tokens, ['colors', 'fonts'], 'tokens', report);

  for (const [name, value, path] of tokenEntries(tokens, 'colors', report)) {
    const color = colorOf(value, path, report);
    if (color?.kind === 'hex') colors.set(name, color.hex);
    else if (color !== undefined) {
      report('invalid-value', 'A color token must be a #RRGGBB value.', path);
    }
  }
  for (const [name, value, path] of tokenEntries(tokens, 'fonts', report)) {
    if (isNonEmptyStringList(value)) fonts.set(name, value);
    else report('invalid-type', 'Expected a list of family names.', path);
  }
  return { colors, fonts };
}

/** Reads a stylesheet. Problems in the file are reported and the rest is still read. */
export function parseStylesheet(source: string): StylesheetParseResult {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const diagnostics: Diagnostic[] = [];
  const report: Report = (code, message, path) => {
    diagnostics.push({ severity: 'error', code, message, path });
  };

  const document = parseDocument(text);
  for (const error of document.errors) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-yaml',
      message: error.message,
      ...(error.linePos !== undefined ? { line: error.linePos[0].line } : {}),
    });
  }
  if (document.errors.length > 0)
    return { stylesheet: EMPTY, diagnostics, formatVersion: undefined };

  const root: unknown = document.toJS();
  const data = asMap(root, '', report);
  if (data === undefined) return { stylesheet: EMPTY, diagnostics, formatVersion: undefined };

  checkKeys(
    data,
    ['phrase-format', 'tokens', 'paragraph-styles', 'character-styles', 'table-styles'],
    '',
    report,
  );
  const version = data['phrase-format'];
  const formatVersion =
    typeof version === 'number' && Number.isInteger(version) ? version : undefined;
  if (formatVersion === undefined) {
    report(
      'format-version-missing',
      'The file must contain a whole number "phrase-format".',
      'phrase-format',
    );
  } else if (formatVersion !== FORMAT_VERSION) {
    report(
      'format-version-unsupported',
      `Format version ${String(formatVersion)} is not supported (expected ${String(FORMAT_VERSION)}).`,
      'phrase-format',
    );
  }

  const stylesheet: Stylesheet = {
    tokens: readTokens(data, report),
    paragraphStyles: readSection(
      data,
      'paragraph-styles',
      (m, p) => readParagraphStyle(m, p, report),
      report,
    ),
    characterStyles: readSection(
      data,
      'character-styles',
      (m, p) => readCharacterStyle(m, p, report),
      report,
    ),
    tableStyles: readSection(data, 'table-styles', (m, p) => readTableStyle(m, p, report), report),
  };

  // The meaning of a stylesheet is only checked once it has been read without errors.
  const semantic = diagnostics.length === 0 ? validateStylesheet(stylesheet) : [];
  return { stylesheet, diagnostics: [...diagnostics, ...semantic], formatVersion };
}
