import {
  normalizeDocument,
  normalizeInlines,
  plainCellInlines,
  type Block,
  type Document,
  type Inline,
  type List,
  type Mark,
  type Table,
  type TableCell,
} from '@phrase/core';
import { formatAnnotation } from './annotation.js';
import { serializeFrontMatter } from './front-matter.js';
import { parseInlineText } from './parse.js';

type Context = 'paragraph' | 'heading' | 'cell';

/** The canonical text of a document. Parsing it again gives the same normalized document. */
export function serializeDocument(document: Document): string {
  const normalized = normalizeDocument(document);
  const lines = serializeFrontMatter(normalized.meta);
  const body = serializeBlocks(normalized.blocks, () => true);
  if (body.length > 0) lines.push('', ...body);
  return `${lines.join('\n')}\n`;
}

function serializeBlocks(
  blocks: readonly Block[],
  blankBetween: (previous: Block, next: Block) => boolean,
): string[] {
  const lines: string[] = [];
  // Adjacent lists of the same kind would merge into one, so every second one uses another marker.
  let streak = 0;
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    if (previous !== undefined && blankBetween(previous, block)) lines.push('');
    const adjacent =
      block.type === 'list' && previous?.type === 'list' && previous.kind === block.kind;
    streak = adjacent ? streak + 1 : 0;
    lines.push(...serializeBlock(block, streak % 2 === 1));
  });
  return lines;
}

/** Inside a list item a nested list follows its paragraph directly; other blocks are separated. */
function itemBlank(previous: Block, next: Block): boolean {
  return !(previous.type === 'paragraph' && next.type === 'list');
}

function annotationLine(block: Block): string[] {
  const line = formatAnnotation({
    ...(block.id !== undefined ? { id: block.id } : {}),
    ...(block.style !== undefined ? { style: block.style } : {}),
    ...(block.type === 'table' && block.widths !== undefined ? { widths: block.widths } : {}),
  });
  return line === undefined ? [] : [line];
}

function serializeBlock(block: Block, alternateMarker: boolean): string[] {
  return [...annotationLine(block), ...serializeBlockContent(block, alternateMarker)];
}

function serializeBlockContent(block: Block, alternateMarker: boolean): string[] {
  switch (block.type) {
    case 'heading':
      return [`${'#'.repeat(block.level)} ${serializeInlines(block.content, 'heading')}`.trimEnd()];
    case 'paragraph':
      return [serializeInlines(block.content, 'paragraph')];
    case 'list':
      return serializeList(block, alternateMarker);
    case 'table':
      return serializeTable(block);
    case 'code':
      return fence(block.text, block.language ?? '');
    case 'phrase':
      return fence(block.text, `phrase-${block.kind}`);
  }
}

function serializeList(list: List, alternateMarker: boolean): string[] {
  const loose = list.items.some((item) =>
    item.blocks.some((block, index) => {
      const previous = item.blocks[index - 1];
      return previous !== undefined && itemBlank(previous, block);
    }),
  );
  const marker =
    list.kind === 'bulleted' ? (alternateMarker ? '*' : '-') : alternateMarker ? '1)' : '1.';
  const indent = ' '.repeat(marker.length + 1);
  const lines: string[] = [];
  list.items.forEach((item, index) => {
    if (index > 0 && loose) lines.push('');
    const content = serializeBlocks(item.blocks, itemBlank);
    if (content.length === 0) {
      lines.push(marker);
      return;
    }
    content.forEach((line, lineIndex) => {
      if (lineIndex === 0) lines.push(`${marker} ${line}`);
      else lines.push(line === '' ? '' : indent + line);
    });
  });
  return lines;
}

/** Until the `phrase-table` block (ADR 0048), only a cell of plain text can be written. */
function plainContent(cell: TableCell): readonly Inline[] {
  const inlines = plainCellInlines(cell);
  if (inlines === undefined) {
    throw new Error('A table cell with more than one plain paragraph cannot be written yet.');
  }
  return inlines;
}

function serializeTable(table: Table): string[] {
  const row = (cells: readonly TableCell[]): string =>
    `| ${cells.map((cell) => serializeInlines(plainContent(cell), 'cell')).join(' | ')} |`;
  return [
    row(table.header),
    `| ${table.header.map(() => '---').join(' | ')} |`,
    ...table.rows.map(row),
  ];
}

function fence(text: string, info: string): string[] {
  const runs = [...text.matchAll(/`+/g)].map((match) => match[0].length);
  const length = Math.max(3, ...runs.map((n) => n + 1));
  const marker = '`'.repeat(length);
  return [`${marker}${info}`, ...(text === '' ? [] : text.split('\n')), marker];
}

function sameMark(a: Mark, b: Mark): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'link' && b.type === 'link') return a.href === b.href;
  if (a.type === 'style' && b.type === 'style') return a.name === b.name;
  return true;
}

function destination(href: string): string {
  if (href !== '' && !/[\s()<>]/.test(href)) return href;
  return `<${href.replace(/[\\<>]/g, '\\$&')}>`;
}

function opener(mark: Mark, html: boolean): string {
  switch (mark.type) {
    case 'link':
      return '[';
    case 'style':
      return `<span class="${mark.name}">`;
    case 'strong':
      return html ? '<strong>' : '**';
    case 'emphasis':
      return html ? '<em>' : '*';
    case 'code':
      return '';
  }
}

function closer(mark: Mark, html: boolean): string {
  switch (mark.type) {
    case 'link':
      return `](${destination(mark.href)})`;
    case 'style':
      return '</span>';
    case 'strong':
      return html ? '</strong>' : '**';
    case 'emphasis':
      return html ? '</em>' : '*';
    case 'code':
      return '';
  }
}

function sameRuns(a: readonly Inline[], b: readonly Inline[]): boolean {
  return (
    a.length === b.length &&
    a.every((run, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        run.text === other.text &&
        run.marks.length === other.marks.length &&
        run.marks.every((mark, i) => {
          const counterpart = other.marks[i];
          return counterpart !== undefined && sameMark(mark, counterpart);
        })
      );
    })
  );
}

/**
 * Strong and emphasis use `*` delimiters, which only work next to the right kind of character.
 * When the result would not read back as the same runs, the block uses `<strong>` and `<em>`.
 */
export function serializeInlines(runs: readonly Inline[], context: Context): string {
  const normalized = normalizeInlines(runs);
  const candidate = renderInlines(normalized, context, false);
  const emphasised = normalized.some((run) =>
    run.marks.some((mark) => mark.type === 'strong' || mark.type === 'emphasis'),
  );
  if (!emphasised) return candidate;
  const parsed = parseInlineText(candidate, context);
  return parsed !== undefined && sameRuns(parsed, normalized)
    ? candidate
    : renderInlines(normalized, context, true);
}

function renderInlines(runs: readonly Inline[], context: Context, html: boolean): string {
  let out = '';
  const stack: Mark[] = [];

  for (const run of runs) {
    const outer = run.marks.filter((mark) => mark.type !== 'code');
    let common = 0;
    for (; common < stack.length && common < outer.length; common += 1) {
      const open = stack[common];
      const wanted = outer[common];
      if (open === undefined || wanted === undefined || !sameMark(open, wanted)) break;
    }
    while (stack.length > common) {
      const mark = stack.pop();
      if (mark !== undefined) out += closer(mark, html);
    }
    for (const mark of outer.slice(common)) {
      out += opener(mark, html);
      stack.push(mark);
    }
    out += run.marks.some((mark) => mark.type === 'code')
      ? codeSpan(run.text, context)
      : escapeText(
          run.text,
          context,
          out === '',
          run.marks.some((mark) => mark.type === 'link'),
        );
  }
  while (stack.length > 0) {
    const mark = stack.pop();
    if (mark !== undefined) out += closer(mark, html);
  }

  // A trailing run of `#` after a space would be read as the closing sequence of a heading.
  return context === 'heading' ? out.replace(/(^|\s)(#+)$/, '$1\\$2') : out;
}

function codeSpan(text: string, context: Context): string {
  const lengths = new Set([...text.matchAll(/`+/g)].map((match) => match[0].length));
  let size = 1;
  while (lengths.has(size)) size += 1;
  const ticks = '`'.repeat(size);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  const body = context === 'cell' ? text.replace(/\|/g, '\\|') : text;
  return `${ticks}${pad}${body}${pad}${ticks}`;
}

const ENTITY = /^&(#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/;

function isAlphanumeric(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

/** Indices of characters that would start a block construct at the beginning of a line. */
function lineStartEscapes(text: string): Set<number> {
  const indices = new Set<number>();
  // A leading `[ ]` or `[x]` is a task-list marker on GitHub.
  if (/^[#>+~-]/.test(text) || /^\[[ xX]\](\s|$)/.test(text)) indices.add(0);
  const ordered = /^(\d+)[.)]/.exec(text);
  if (ordered?.[1] !== undefined) indices.add(ordered[1].length);
  return indices;
}

/** Reference links are not supported, so `]` matters only before `(`, where it would end a link. */
function escapeText(text: string, context: Context, atStart: boolean, inLink: boolean): string {
  const startEscapes =
    atStart && context === 'paragraph' ? lineStartEscapes(text) : new Set<number>();
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    const escape =
      startEscapes.has(i) ||
      '\\`*<'.includes(char) ||
      (inLink && '[]'.includes(char)) ||
      (char === ']' && text.charAt(i + 1) === '(') ||
      (char === '_' &&
        !(isAlphanumeric(text.charAt(i - 1)) && isAlphanumeric(text.charAt(i + 1)))) ||
      (char === '&' && ENTITY.test(text.slice(i))) ||
      (char === '|' && context === 'cell');
    result += escape ? `\\${char}` : char;
  }
  return result;
}
