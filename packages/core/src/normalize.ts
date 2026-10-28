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

const MARK_ORDER: Record<Mark['type'], number> = {
  link: 0,
  style: 1,
  strong: 2,
  emphasis: 3,
  code: 4,
};

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

function plain(text: string): Text {
  return { type: 'text', text, marks: [] };
}

/** Moves whitespace at the edges of a marked run out of the marks. */
function splitEdgeWhitespace(run: Text): Text[] {
  if (run.marks.length === 0) return [run];
  const leading = /^\s+/u.exec(run.text)?.[0] ?? '';
  const rest = run.text.slice(leading.length);
  const trailing = /\s+$/u.exec(rest)?.[0] ?? '';
  const body = rest.slice(0, rest.length - trailing.length);
  return [plain(leading), { ...run, text: body }, plain(trailing)];
}

/**
 * Brings inline content to the one form Markdown can express: no empty runs, marks ordered and
 * unique, no whitespace at the edges of marked runs, and adjacent runs with equal marks merged.
 */
export function normalizeInlines(inlines: readonly Inline[]): readonly Inline[] {
  const result: Text[] = [];
  for (const inline of inlines) {
    for (const part of splitEdgeWhitespace({ ...inline, marks: normalizeMarks(inline.marks) })) {
      if (part.text === '') continue;
      const last = result[result.length - 1];
      if (last !== undefined && sameMarks(last.marks, part.marks)) {
        result[result.length - 1] = { ...last, text: last.text + part.text };
      } else {
        result.push(part);
      }
    }
  }
  return result;
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

function normalizeListItemBlock(block: ListItemBlock): ListItemBlock {
  switch (block.type) {
    case 'paragraph':
      return { ...block, content: normalizeInlines(block.content) };
    case 'list':
      return {
        ...block,
        items: block.items.map((item) => ({ blocks: item.blocks.map(normalizeListItemBlock) })),
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

/** Normalizes the inline content of every block. Metadata is left as it is. */
export function normalizeDocument(document: Document): Document {
  return { ...document, blocks: document.blocks.map(normalizeBlock) };
}
