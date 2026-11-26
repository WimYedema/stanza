import {
  BUILT_IN_PAGE_TEMPLATE,
  COVER_ALIGNMENTS,
  PAGE_SIZE_NAMES,
  RESERVED_TABLE_STYLE,
  SLOT_TOKENS,
  type Cover,
  type CoverAlignment,
  type CoverArea,
  type CoverColumnWidth,
  type CoverEntry,
  type CoverGrid,
  type CoverLayoutRow,
  type CoverRow,
  type CoverRowHeight,
  type HeaderFooter,
  type PageMargins,
  type PageSize,
  type PageTemplate,
  type SlotPart,
} from '@stanza/core';
import {
  asMap,
  checkKeys,
  describe,
  join,
  readColor,
  readName,
  readNumber,
  readString,
  type Data,
  type Mutable,
  type Report,
} from './yaml-decode.js';

const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** A token is written as a link whose target is `stanza:` and the token name (ADR 0017). */
const SLOT_LINK = /\[([^\]]*)\]\(stanza:([^)\s]*)\)/g;

/** A custom metadata field is written `field:<name>`, with a kebab-case name. */
const FIELD_TOKEN = /^field:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

/** Splits the text of a slot into literal text and tokens. An unknown token stays literal text. */
function readSlotText(text: string, path: string, report: Report): SlotPart[] {
  const parts: SlotPart[] = [];
  let from = 0;
  const literalUpTo = (end: number): void => {
    if (end > from) parts.push({ kind: 'text', text: text.slice(from, end) });
  };
  for (const match of text.matchAll(SLOT_LINK)) {
    const [whole, label = '', name = ''] = match;
    const token = SLOT_TOKENS.find((candidate) => candidate === name);
    const field = FIELD_TOKEN.exec(name)?.[1];
    if (token === undefined && field === undefined) {
      report('unknown-slot-token', `Unknown token "${name}".`, path);
      continue;
    }
    literalUpTo(match.index);
    parts.push(
      token !== undefined
        ? { kind: 'token', token, label }
        : { kind: 'field', name: field ?? '', label },
    );
    from = match.index + whole.length;
  }
  literalUpTo(text.length);
  return parts;
}

function readCoverEntry(value: unknown, path: string, report: Report): CoverEntry | undefined {
  const map = asMap(value, path, report);
  if (map === undefined) return undefined;
  checkKeys(map, ['style', 'text', 'table', 'image', 'width'], path, report);
  const kinds = ['text', 'table', 'image'].filter((key) => map[key] !== undefined);
  if (kinds.length !== 1) {
    report('invalid-value', 'An entry has one of "text", "table" or "image".', path);
    return undefined;
  }
  if (map['width'] !== undefined && map['image'] === undefined) {
    report('unknown-property', 'Only an image has a "width".', join(path, 'width'));
  }
  if (map['image'] !== undefined) {
    const image = readString(map, 'image', path, report);
    const widthPt = readNumber(map, 'width', path, report);
    const style = readName(map, 'style', path, report);
    if (image === undefined) return undefined;
    return {
      kind: 'image',
      path: image,
      ...(widthPt !== undefined ? { widthPt } : {}),
      ...(style !== undefined ? { style } : {}),
    };
  }
  if (map['table'] === undefined) {
    const text = readString(map, 'text', path, report);
    const style = readName(map, 'style', path, report);
    if (text === undefined) return undefined;
    return {
      kind: 'paragraph',
      ...(style !== undefined ? { style } : {}),
      text: readSlotText(text, join(path, 'text'), report),
    };
  }
  if (map['style'] !== undefined) {
    report(
      'unknown-property',
      'The style of a table is given inside "table".',
      join(path, 'style'),
    );
  }
  const here = join(path, 'table');
  const table = asMap(map['table'], here, report);
  if (table === undefined) return undefined;
  checkKeys(table, ['style', 'rows'], here, report);
  const style = readName(table, 'style', here, report) ?? RESERVED_TABLE_STYLE;
  const given = table['rows'];
  if (!Array.isArray(given)) {
    report('invalid-type', `Expected a list, found ${describe(given)}.`, join(here, 'rows'));
    return undefined;
  }
  const rows: CoverRow[] = [];
  given.forEach((item: unknown, index) => {
    const rowPath = `${join(here, 'rows')}[${String(index)}]`;
    const row = asMap(item, rowPath, report);
    if (row === undefined) return;
    checkKeys(row, ['label', 'value'], rowPath, report);
    const label = readString(row, 'label', rowPath, report);
    const value = readString(row, 'value', rowPath, report);
    if (label === undefined || value === undefined) {
      report('invalid-value', 'A row needs a "label" and a "value".', rowPath);
      return;
    }
    rows.push({ label, value: readSlotText(value, join(rowPath, 'value'), report) });
  });
  return { kind: 'table', style, rows };
}

function readEntries(value: unknown, path: string, report: Report): CoverEntry[] | undefined {
  if (!Array.isArray(value)) {
    report('invalid-type', `Expected a list, found ${describe(value)}.`, path);
    return undefined;
  }
  return value.flatMap((entry: unknown, index) => {
    const read = readCoverEntry(entry, `${path}[${String(index)}]`, report);
    return read === undefined ? [] : [read];
  });
}

/** A share of what is left, such as `1fr` or `0.5fr` (ADR 0089). */
const SHARE = /^(\d+(?:\.\d+)?)fr$/;

/** A size in points or a share such as `1fr`, or undefined after a report. */
function readSize(
  value: unknown,
  path: string,
  report: Report,
  what: string,
): { kind: 'points'; pt: number } | { kind: 'share'; fr: number } | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'points', pt: value };
  const share = typeof value === 'string' ? SHARE.exec(value.trim()) : null;
  if (share !== null) return { kind: 'share', fr: Number(share[1]) };
  report('invalid-value', `Expected ${what} in points or a share such as "1fr".`, path);
  return undefined;
}

function readHeight(map: Data, path: string, report: Report): CoverRowHeight {
  const value = map['height'];
  if (value === undefined) return { kind: 'auto' };
  return readSize(value, join(path, 'height'), report, 'a height') ?? { kind: 'auto' };
}

function readAlignment(map: Data, path: string, report: Report): CoverAlignment {
  const given = map['valign'];
  if (given === undefined) return 'top';
  const found = COVER_ALIGNMENTS.find((name) => name === given);
  if (found === undefined) {
    report('invalid-value', 'Expected top, center or bottom.', join(path, 'valign'));
    return 'top';
  }
  return found;
}

/** An area name is kebab-case, as a style name; `.` is a cell of no area. */
const AREA_NAME = /^(?:\.|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

/** The grid of a cover (ADR 0092): columns, rows of heights, the lines of areas and their content. */
function readGrid(
  map: Data,
  path: string,
  report: Report,
  margins: Partial<PageMargins> | undefined,
  /** For a header or a footer: rows left out are one row that grows for each line of areas. */
  growingRows = false,
): CoverGrid | undefined {
  const list = (key: string): unknown[] | undefined => {
    const value = map[key];
    if (Array.isArray(value)) return value as unknown[];
    report('invalid-type', `Expected a list, found ${describe(value)}.`, join(path, key));
    return undefined;
  };
  const columnsGiven = map['columns'] === undefined ? ['1fr'] : list('columns');
  const areasLength = Array.isArray(map['areas']) ? map['areas'].length : 0;
  const rowsGiven =
    growingRows && map['rows'] === undefined
      ? Array.from({ length: areasLength }, () => 'auto')
      : list('rows');
  const areasGiven = list('areas');
  if (columnsGiven === undefined || rowsGiven === undefined || areasGiven === undefined) {
    return undefined;
  }
  const columns: CoverColumnWidth[] = [];
  columnsGiven.forEach((value: unknown, index) => {
    const size = readSize(value, `${join(path, 'columns')}[${String(index)}]`, report, 'a width');
    if (size !== undefined) columns.push(size);
  });
  const rows = rowsGiven.map((value: unknown, index): CoverRowHeight => {
    if (value === 'auto') return { kind: 'auto' };
    return (
      readSize(value, `${join(path, 'rows')}[${String(index)}]`, report, 'a height or auto') ?? {
        kind: 'auto',
      }
    );
  });
  const areas = areasGiven.map((value: unknown, index): string[] => {
    const where = `${join(path, 'areas')}[${String(index)}]`;
    if (typeof value !== 'string') {
      report('invalid-type', `Expected a line of area names, found ${describe(value)}.`, where);
      return [];
    }
    const names = value
      .trim()
      .split(/\s+/)
      .filter((name) => name !== '');
    const bad = names.find((name) => !AREA_NAME.test(name));
    if (bad !== undefined) {
      report(
        'invalid-value',
        `"${bad}" is not an area name: use kebab-case, or "." for none.`,
        where,
      );
    }
    return names;
  });
  const area: Record<string, CoverArea> = {};
  if (map['area'] !== undefined) {
    const here = join(path, 'area');
    const given = asMap(map['area'], here, report);
    for (const [name, value] of Object.entries(given ?? {})) {
      const at = join(here, name);
      const entry = asMap(value, at, report);
      if (entry === undefined) continue;
      checkKeys(entry, ['valign', 'background', 'content'], at, report);
      const content =
        entry['content'] === undefined
          ? []
          : readEntries(entry['content'], join(at, 'content'), report);
      const background = readColor(entry, 'background', at, report);
      area[name] = {
        valign: readAlignment(entry, at, report),
        ...(background !== undefined ? { background } : {}),
        content: content ?? [],
      };
    }
  }
  return {
    kind: 'grid',
    ...(margins !== undefined ? { margins } : {}),
    columns,
    rows,
    areas,
    area,
  };
}

function readLayoutRow(value: unknown, path: string, report: Report): CoverLayoutRow | undefined {
  const map = asMap(value, path, report);
  if (map === undefined) return undefined;
  checkKeys(map, ['height', 'valign', 'background', 'content'], path, report);
  const height = readHeight(map, path, report);
  const valign = readAlignment(map, path, report);
  const background = readColor(map, 'background', path, report);
  const content =
    map['content'] === undefined ? [] : readEntries(map['content'], join(path, 'content'), report);
  return {
    height,
    valign,
    ...(background !== undefined ? { background } : {}),
    content: content ?? [],
  };
}

function readCover(value: unknown, path: string, report: Report): Cover | undefined {
  if (Array.isArray(value)) {
    const entries = readEntries(value, path, report);
    return entries === undefined ? undefined : { kind: 'list', entries };
  }
  const map = asMap(value, path, report);
  if (map === undefined) return undefined;
  const margins =
    map['margins'] === undefined
      ? undefined
      : readMargins(map['margins'], join(path, 'margins'), report);
  if (map['areas'] !== undefined) {
    checkKeys(map, ['margins', 'columns', 'rows', 'areas', 'area'], path, report);
    return readGrid(map, path, report, margins);
  }
  // `columns` and `area` belong to a grid, which has `areas`.
  checkKeys(map, ['margins', 'rows'], path, report);
  const given = map['rows'];
  if (!Array.isArray(given)) {
    report('invalid-type', `Expected a list, found ${describe(given)}.`, join(path, 'rows'));
    return undefined;
  }
  const rows = given.flatMap((row: unknown, index) => {
    const read = readLayoutRow(row, `${join(path, 'rows')}[${String(index)}]`, report);
    return read === undefined ? [] : [read];
  });
  return { kind: 'rows', ...(margins !== undefined ? { margins } : {}), rows };
}

/** The sides that a map of margins gives; the others are left out. */
function readMargins(
  value: unknown,
  path: string,
  report: Report,
): Partial<PageMargins> | undefined {
  const sides = asMap(value, path, report);
  if (sides === undefined) return undefined;
  checkKeys(sides, MARGIN_SIDES, path, report);
  const margins: Mutable<Partial<PageMargins>> = {};
  const top = readNumber(sides, 'top', path, report);
  if (top !== undefined) margins.topPt = top;
  const right = readNumber(sides, 'right', path, report);
  if (right !== undefined) margins.rightPt = right;
  const bottom = readNumber(sides, 'bottom', path, report);
  if (bottom !== undefined) margins.bottomPt = bottom;
  const left = readNumber(sides, 'left', path, report);
  if (left !== undefined) margins.leftPt = left;
  return margins;
}

function readHeaderFooter(map: Data, path: string, report: Report): HeaderFooter {
  const style = readName(map, 'style', path, report);
  const distancePt = readNumber(map, 'distance', path, report);
  const common = {
    ...(style !== undefined ? { style } : {}),
    ...(distancePt !== undefined ? { distancePt } : {}),
  };
  // A header or a footer with areas is a grid (ADR 0095), in place of the three slots.
  if (map['areas'] !== undefined) {
    checkKeys(map, ['style', 'distance', 'columns', 'rows', 'areas', 'area'], path, report);
    const grid = readGrid(map, path, report, undefined, true);
    return { ...common, left: [], center: [], right: [], ...(grid !== undefined ? { grid } : {}) };
  }
  checkKeys(map, ['style', 'distance', 'left', 'center', 'right'], path, report);
  const slot = (name: 'left' | 'center' | 'right'): SlotPart[] => {
    const text = readString(map, name, path, report);
    return text === undefined ? [] : readSlotText(text, join(path, name), report);
  };
  return { ...common, left: slot('left'), center: slot('center'), right: slot('right') };
}

export function readPageTemplate(map: Data, path: string, report: Report): PageTemplate {
  checkKeys(map, ['size', 'margins', 'header', 'footer', 'cover', 'title-block'], path, report);
  let size: PageSize = BUILT_IN_PAGE_TEMPLATE.size;
  const given = map['size'];
  if (given !== undefined) {
    const found = PAGE_SIZE_NAMES.find((name) => name === given);
    if (found === undefined) {
      report('invalid-value', 'Expected the size A4 or Letter.', join(path, 'size'));
    } else {
      size = found;
    }
  }

  const givenMargins =
    map['margins'] === undefined
      ? undefined
      : readMargins(map['margins'], join(path, 'margins'), report);
  const margins: PageMargins = { ...BUILT_IN_PAGE_TEMPLATE.margins, ...givenMargins };
  const slots = (name: 'header' | 'footer'): { header?: HeaderFooter; footer?: HeaderFooter } => {
    if (map[name] === undefined) return {};
    const here = join(path, name);
    const entries = asMap(map[name], here, report);
    return entries === undefined ? {} : { [name]: readHeaderFooter(entries, here, report) };
  };
  const cover =
    map['cover'] === undefined ? undefined : readCover(map['cover'], join(path, 'cover'), report);
  const titleBlock =
    map['title-block'] === undefined
      ? undefined
      : readEntries(map['title-block'], join(path, 'title-block'), report);
  return {
    size,
    margins,
    ...slots('header'),
    ...slots('footer'),
    ...(cover !== undefined ? { cover } : {}),
    ...(titleBlock !== undefined ? { titleBlock } : {}),
  };
}
