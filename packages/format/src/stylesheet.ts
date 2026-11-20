import {
  DEFAULT_TABLE_OF_CONTENTS,
  PARAGRAPH_PROPERTIES,
  TEXT_PROPERTIES,
  isStyleName,
  propertyKeys,
  validateStylesheet,
  VARIANT_MARKS,
  type BandedRows,
  type Border,
  type CharacterStyle,
  type ColorValue,
  type Diagnostic,
  type FontValue,
  type HeaderRow,
  type LineSpacing,
  type ParagraphProps,
  type ParagraphStyle,
  type PropertyType,
  type StyleName,
  type StyleProperty,
  type Stylesheet,
  type TableBorders,
  type TableOfContentsOptions,
  type TableStyle,
  type TextProps,
  type VariantDeclaration,
  type VariantMark,
} from '@stanza/core';
import {
  KEBAB_CASE,
  asMap,
  checkKeys,
  describe,
  isNonEmptyStringList,
  join,
  readBoolean,
  readString,
  readFormatVersion,
  readName,
  readNumber,
  readYamlRoot,
  type Data,
  type Mutable,
  type Report,
} from './yaml-decode.js';
import { readPageTemplate } from './stylesheet-pages.js';

export interface StylesheetParseResult {
  readonly stylesheet: Stylesheet;
  readonly diagnostics: readonly Diagnostic[];
  /** The `stanza-format` value found in the file, when there was one. */
  readonly formatVersion: number | undefined;
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const EMPTY: Stylesheet = {
  tokens: { colors: new Map(), fonts: new Map() },
  paragraphStyles: new Map(),
  characterStyles: new Map(),
  tableStyles: new Map(),
  pageTemplates: new Map(),
  tableOfContents: DEFAULT_TABLE_OF_CONTENTS,
};

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

/** One of a fixed set of words, reported with all of them when it is none. */
function readChoice(
  map: Data,
  key: string,
  values: readonly string[],
  path: string,
  report: Report,
): string | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && values.includes(value)) return value;
  const last = values[values.length - 1] ?? '';
  report(
    'invalid-value',
    `Expected ${values.slice(0, -1).join(', ')}, or ${last}.`,
    join(path, key),
  );
  return undefined;
}

/** Reads the value of a property of a kind that is written as one value. */
function readProperty(
  type: PropertyType,
  key: string,
  map: Data,
  path: string,
  report: Report,
): unknown {
  switch (type.kind) {
    case 'number':
      return readNumber(map, key, path, report);
    case 'boolean':
      return readBoolean(map, key, path, report);
    case 'color':
      return readColor(map, key, path, report);
    case 'font':
      return readFont(map, key, path, report);
    case 'choice':
      return readChoice(map, key, type.values, path, report);
    case 'line-spacing':
      return readLineSpacing(map, path, report);
    default:
      // The others are mappings with properties of their own, read where they are used.
      return undefined;
  }
}

/** The properties of a list as the model has them: only those that are set, in list order. */
function readProperties(
  properties: readonly (StyleProperty & { readonly prop: string })[],
  map: Data,
  path: string,
  report: Report,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const { key, prop, type } of properties) {
    const value = readProperty(type, key, map, path, report);
    if (value !== undefined) props[prop] = value;
  }
  return props;
}

// The list of properties names the fields of the model, and a test keeps the two together.
function readText(map: Data, path: string, report: Report): TextProps {
  return readProperties(TEXT_PROPERTIES, map, path, report);
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
  return readProperties(PARAGRAPH_PROPERTIES, map, path, report);
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
    checkKeys(props, propertyKeys('variant'), join(here, mark), report);
    variants[mark] = readText(props, join(here, mark), report);
  }
  return variants;
}

function readParagraphStyle(map: Data, path: string, report: Report): ParagraphStyle {
  checkKeys(map, propertyKeys('paragraph-style'), path, report);
  const basedOn = readName(map, 'based-on', path, report);
  const label = readString(map, 'label', path, report);
  return {
    ...(basedOn !== undefined ? { basedOn } : {}),
    ...(label !== undefined ? { label } : {}),
    text: readText(map, path, report),
    paragraph: readParagraph(map, path, report),
    variants: readVariants(map, path, report),
  };
}

function readCharacterStyle(map: Data, path: string, report: Report): CharacterStyle {
  checkKeys(map, propertyKeys('character-style'), path, report);
  const basedOn = readName(map, 'based-on', path, report);
  const label = readString(map, 'label', path, report);
  return {
    ...(basedOn !== undefined ? { basedOn } : {}),
    ...(label !== undefined ? { label } : {}),
    text: readText(map, path, report),
  };
}

function readBorder(map: Data, key: string, path: string, report: Report): Border | undefined {
  if (map[key] === undefined) return undefined;
  const here = join(path, key);
  const border = asMap(map[key], here, report);
  if (border === undefined) return undefined;
  checkKeys(border, propertyKeys('border'), here, report);
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
  checkKeys(map, propertyKeys('table-style'), path, report);
  const style: Mutable<TableStyle> = {};
  const basedOn = readName(map, 'based-on', path, report);
  if (basedOn !== undefined) style.basedOn = basedOn;
  const label = readString(map, 'label', path, report);
  if (label !== undefined) style.label = label;
  const cellStyle = readName(map, 'cell-style', path, report);
  if (cellStyle !== undefined) style.cellStyle = cellStyle;

  if (map['border'] !== undefined) {
    const here = join(path, 'border');
    const borders = asMap(map['border'], here, report);
    if (borders !== undefined) {
      checkKeys(borders, propertyKeys('borders'), here, report);
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
      checkKeys(row, propertyKeys('header-row'), here, report);
      const header: Mutable<HeaderRow> = { text: readText(row, here, report) };
      const background = readColor(row, 'background', here, report);
      if (background !== undefined) header.background = background;
      const repeat = readBoolean(row, 'repeat', here, report);
      if (repeat !== undefined) header.repeat = repeat;
      style.headerRow = header;
    }
  }

  if (map['banded-rows'] !== undefined) {
    const here = join(path, 'banded-rows');
    const bands = asMap(map['banded-rows'], here, report);
    if (bands !== undefined) {
      checkKeys(bands, propertyKeys('banded-rows'), here, report);
      const result: Mutable<BandedRows> = {};
      const odd = readColor(bands, 'odd', here, report);
      if (odd !== undefined) result.odd = odd;
      const even = readColor(bands, 'even', here, report);
      if (even !== undefined) result.even = even;
      style.bandedRows = result;
    }
  }

  const padding = readNumber(map, 'cell-padding', path, report);
  if (padding !== undefined) style.cellPaddingPt = padding;
  return style;
}

function readTableOfContents(data: Data, report: Report): TableOfContentsOptions {
  const path = 'table-of-contents';
  if (data[path] === undefined) return DEFAULT_TABLE_OF_CONTENTS;
  const map = data[path] === null ? {} : asMap(data[path], path, report);
  if (map === undefined) return DEFAULT_TABLE_OF_CONTENTS;
  checkKeys(map, ['page-numbers'], path, report);
  const pageNumbers = readBoolean(map, 'page-numbers', path, report);
  return { pageNumbers: pageNumbers ?? DEFAULT_TABLE_OF_CONTENTS.pageNumbers };
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
  const diagnostics: Diagnostic[] = [];
  const report: Report = (code, message, path) => {
    diagnostics.push({ severity: 'error', code, message, path });
  };

  const data = readYamlRoot(source, diagnostics);
  if (data === undefined) return { stylesheet: EMPTY, diagnostics, formatVersion: undefined };

  checkKeys(
    data,
    [
      'stanza-format',
      'tokens',
      'paragraph-styles',
      'character-styles',
      'table-styles',
      'page-templates',
      'table-of-contents',
    ],
    '',
    report,
  );
  const formatVersion = readFormatVersion(data, report);

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
    pageTemplates: readSection(
      data,
      'page-templates',
      (m, p) => readPageTemplate(m, p, report),
      report,
    ),
    tableOfContents: readTableOfContents(data, report),
  };

  // The meaning of a stylesheet is only checked once it has been read without errors.
  const semantic = diagnostics.length === 0 ? validateStylesheet(stylesheet) : [];
  return { stylesheet, diagnostics: [...diagnostics, ...semantic], formatVersion };
}
