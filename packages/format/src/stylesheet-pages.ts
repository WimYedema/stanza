import {
  BUILT_IN_PAGE_TEMPLATE,
  PAGE_SIZE_NAMES,
  RESERVED_TABLE_STYLE,
  SLOT_TOKENS,
  type CoverEntry,
  type CoverRow,
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
  checkKeys(map, ['style', 'text', 'table'], path, report);
  if ((map['text'] === undefined) === (map['table'] === undefined)) {
    report('invalid-value', 'An entry has either "text" or "table".', path);
    return undefined;
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

function readCover(value: unknown, path: string, report: Report): CoverEntry[] | undefined {
  if (!Array.isArray(value)) {
    report('invalid-type', `Expected a list, found ${describe(value)}.`, path);
    return undefined;
  }
  return value.flatMap((entry: unknown, index) => {
    const read = readCoverEntry(entry, `${path}[${String(index)}]`, report);
    return read === undefined ? [] : [read];
  });
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
  checkKeys(map, ['size', 'margins', 'header', 'footer', 'cover'], path, report);
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

  const margins: Mutable<PageMargins> = { ...BUILT_IN_PAGE_TEMPLATE.margins };
  if (map['margins'] !== undefined) {
    const here = join(path, 'margins');
    const sides = asMap(map['margins'], here, report);
    if (sides !== undefined) {
      checkKeys(sides, MARGIN_SIDES, here, report);
      const top = readNumber(sides, 'top', here, report);
      if (top !== undefined) margins.topPt = top;
      const right = readNumber(sides, 'right', here, report);
      if (right !== undefined) margins.rightPt = right;
      const bottom = readNumber(sides, 'bottom', here, report);
      if (bottom !== undefined) margins.bottomPt = bottom;
      const left = readNumber(sides, 'left', here, report);
      if (left !== undefined) margins.leftPt = left;
    }
  }
  const slots = (name: 'header' | 'footer'): { header?: HeaderFooter; footer?: HeaderFooter } => {
    if (map[name] === undefined) return {};
    const here = join(path, name);
    const entries = asMap(map[name], here, report);
    return entries === undefined ? {} : { [name]: readHeaderFooter(entries, here, report) };
  };
  const cover =
    map['cover'] === undefined ? undefined : readCover(map['cover'], join(path, 'cover'), report);
  return {
    size,
    margins,
    ...slots('header'),
    ...slots('footer'),
    ...(cover !== undefined ? { cover } : {}),
  };
}
