import {
  BUILT_IN_PAGE_TEMPLATE,
  COVER_ALIGNMENTS,
  PAGE_SIZE_NAMES,
  RESERVED_TABLE_STYLE,
  SLOT_TOKENS,
  type Cover,
  type CoverEntry,
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

function readHeight(map: Data, path: string, report: Report): CoverRowHeight {
  const value = map['height'];
  if (value === undefined) return { kind: 'auto' };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'points', pt: value };
  const share = typeof value === 'string' ? SHARE.exec(value.trim()) : null;
  if (share !== null) return { kind: 'share', fr: Number(share[1]) };
  report(
    'invalid-value',
    'Expected a height in points or a share such as "1fr".',
    join(path, 'height'),
  );
  return { kind: 'auto' };
}

function readLayoutRow(value: unknown, path: string, report: Report): CoverLayoutRow | undefined {
  const map = asMap(value, path, report);
  if (map === undefined) return undefined;
  checkKeys(map, ['height', 'valign', 'content'], path, report);
  const height = readHeight(map, path, report);
  let valign: CoverLayoutRow['valign'] = 'top';
  const given = map['valign'];
  if (given !== undefined) {
    const found = COVER_ALIGNMENTS.find((name) => name === given);
    if (found === undefined) {
      report('invalid-value', 'Expected top, center or bottom.', join(path, 'valign'));
    } else {
      valign = found;
    }
  }
  const content =
    map['content'] === undefined ? [] : readEntries(map['content'], join(path, 'content'), report);
  return { height, valign, content: content ?? [] };
}

function readCover(value: unknown, path: string, report: Report): Cover | undefined {
  if (Array.isArray(value)) {
    const entries = readEntries(value, path, report);
    return entries === undefined ? undefined : { kind: 'list', entries };
  }
  const map = asMap(value, path, report);
  if (map === undefined) return undefined;
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
  const margins =
    map['margins'] === undefined
      ? undefined
      : readMargins(map['margins'], join(path, 'margins'), report);
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
  checkKeys(map, ['style', 'left', 'center', 'right'], path, report);
  const style = readName(map, 'style', path, report);
  const slot = (name: 'left' | 'center' | 'right'): SlotPart[] => {
    const text = readString(map, name, path, report);
    return text === undefined ? [] : readSlotText(text, join(path, name), report);
  };
  return {
    ...(style !== undefined ? { style } : {}),
    left: slot('left'),
    center: slot('center'),
    right: slot('right'),
  };
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
