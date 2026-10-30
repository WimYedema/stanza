import type {
  Block,
  Document,
  Inline,
  ListItemBlock,
  Mark,
  Table,
  TableCell,
  Text,
} from './document.js';
import { MARK_TYPES } from './vocabulary.js';

const MARK_ORDER = Object.fromEntries(MARK_TYPES.map((type, index) => [type, index])) as Record<
  Mark['type'],
  number
>;

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function markKey(mark: Mark): string {
  switch (mark.type) {
    case 'link':
      return `link:${mark.href}`;
    case 'style':
      return `style:${mark.name}`;
    default:
      return mark.type;
  }
}

function normalizeMarks(marks: readonly Mark[]): readonly Mark[] {
  const unique = new Map<string, Mark>();
  for (const mark of marks) unique.set(markKey(mark), mark);
  return [...unique.values()].sort(
    (a, b) => MARK_ORDER[a.type] - MARK_ORDER[b.type] || compareStrings(markKey(a), markKey(b)),
  );
}

function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  return a.length === b.length && a.every((mark, i) => markKey(mark) === markKey(b[i] as Mark));
}

/** How many leading marks two neighbouring runs share. The code mark is never shared. */
function sharedPrefix(marks: readonly Mark[], other: readonly Mark[] | undefined): number {
  if (other === undefined) return 0;
  let count = 0;
  while (count < marks.length && count < other.length) {
    const left = marks[count];
    const right = other[count];
    if (left === undefined || right === undefined) break;
    if (left.type === 'code' || markKey(left) !== markKey(right)) break;
    count += 1;
  }
  return count;
}

function mergeRuns(runs: readonly Text[]): Text[] {
  const result: Text[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last = result[result.length - 1];
    if (last !== undefined && sameMarks(last.marks, run.marks)) {
      result[result.length - 1] = { ...last, text: last.text + run.text };
    } else {
      result.push(run);
    }
  }
  return result;
}

/**
 * Whitespace at the start or end of a span of marks moves out to the marks that continue around
 * it. Whitespace inside a span stays, even when the span is made of several runs. Returns
 * undefined when nothing needed to move.
 */
function moveEdgeWhitespace(runs: readonly Text[]): Text[] | undefined {
  let changed = false;
  const result: Text[] = [];
  for (const [index, run] of runs.entries()) {
    const before = sharedPrefix(run.marks, runs[index - 1]?.marks);
    const after = sharedPrefix(run.marks, runs[index + 1]?.marks);
    const leading = run.marks.length > before ? (/^\s+/u.exec(run.text)?.[0] ?? '') : '';
    const rest = run.text.slice(leading.length);
    const trailing = run.marks.length > after ? (/\s+$/u.exec(rest)?.[0] ?? '') : '';
    if (leading === '' && trailing === '') {
      result.push(run);
      continue;
    }
    changed = true;
    result.push(
      { type: 'text', text: leading, marks: run.marks.slice(0, before) },
      { ...run, text: rest.slice(0, rest.length - trailing.length) },
      { type: 'text', text: trailing, marks: run.marks.slice(0, after) },
    );
  }
  return changed ? result : undefined;
}

/**
 * Brings inline content to the one form Markdown can express: line breaks become spaces, no empty
 * runs, marks ordered and unique, no whitespace at the edges of a span of marks or of the block,
 * and adjacent runs with equal marks merged.
 */
export function normalizeInlines(inlines: readonly Inline[]): readonly Inline[] {
  let runs: Text[] = inlines.map((inline) => ({
    ...inline,
    text: inline.text.replace(/\r\n|\r|\n/g, ' '),
    marks: normalizeMarks(inline.marks),
  }));
  for (;;) {
    runs = mergeRuns(runs);
    const moved = moveEdgeWhitespace(runs);
    if (moved === undefined) break;
    runs = moved;
  }
  trimBlockEdges(runs);
  return runs;
}

/** Marked runs never start or end a block with whitespace, so only plain runs need trimming. */
function trimBlockEdges(runs: Text[]): void {
  const first = runs[0];
  if (first !== undefined && first.marks.length === 0) {
    const text = first.text.trimStart();
    if (text === '') runs.shift();
    else runs[0] = { ...first, text };
  }
  const last = runs[runs.length - 1];
  if (last !== undefined && last.marks.length === 0) {
    const text = last.text.trimEnd();
    if (text === '') runs.pop();
    else runs[runs.length - 1] = { ...last, text };
  }
}

function normalizeCell(cell: TableCell): TableCell {
  return { content: normalizeInlines(cell.content) };
}

function normalizeTable(table: Table): Table {
  return {
    ...table,
    header: table.header.map(normalizeCell),
    rows: table.rows.map((row) => row.map(normalizeCell)),
  };
}

function isEmptyParagraph(block: Block): boolean {
  return block.type === 'paragraph' && block.content.length === 0;
}

function normalizeListItemBlocks(blocks: readonly ListItemBlock[]): ListItemBlock[] {
  return blocks.map(normalizeListItemBlock).filter((block) => !isEmptyParagraph(block));
}

function normalizeListItemBlock(block: ListItemBlock): ListItemBlock {
  switch (block.type) {
    case 'paragraph':
      return { ...block, content: normalizeInlines(block.content) };
    case 'list':
      return {
        ...block,
        items: block.items.map((item) => ({ blocks: normalizeListItemBlocks(item.blocks) })),
      };
    case 'table':
      return normalizeTable(block);
    case 'code':
    case 'phrase':
      return block;
  }
}

function normalizeBlock(block: Block): Block {
  return block.type === 'heading'
    ? { ...block, content: normalizeInlines(block.content) }
    : normalizeListItemBlock(block);
}

/**
 * Normalizes the inline content of every block and drops paragraphs left empty, which Markdown
 * cannot express. Metadata is left as it is.
 */
export function normalizeDocument(document: Document): Document {
  return {
    ...document,
    blocks: document.blocks.map(normalizeBlock).filter((block) => !isEmptyParagraph(block)),
  };
}
