import {
  BODY_STYLE,
  CODE_STYLE,
  LIST_STYLES,
  RESERVED_TABLE_STYLE,
  defaultHeadingStyle,
  resolveTableStyle,
  type Block,
  type CodeBlock,
  type Diagnostic,
  type Heading,
  type Inline,
  type LinkMark,
  type List,
  type ListItemBlock,
  type NodeId,
  type Paragraph as ParagraphBlock,
  type StyleName,
  type Stylesheet,
  type Table as TableBlock,
  type TableCell as TableCellBlock,
} from '@phrase/core';
import {
  Bookmark,
  ExternalHyperlink,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { MAX_LIST_LEVEL, type ListNumbering } from './list-numbering.js';
import type { RunContext, RunStyles } from './run-styles.js';
import { wordStyleId, wordStyleName } from './style-ids.js';

export interface BuildContext {
  readonly stylesheet: Stylesheet;
  readonly runs: RunStyles;
  readonly lists: ListNumbering;
  /** The number of each top-level block, as `numberHeadings` gives them. */
  readonly headingLabels: readonly (string | undefined)[];
  readonly diagnostics: Diagnostic[];
}

interface ListPosition {
  readonly reference: string;
  readonly level: number;
  readonly instance: number;
}

/** The text of a run, with tab characters written as Word tabs. */
function textChildren(text: string): (string | Tab)[] {
  return text.split('\t').flatMap((part, index) => (index === 0 ? [part] : [new Tab(), part]));
}

function linkOf(inline: Inline | undefined): LinkMark | undefined {
  return inline?.marks.find((mark): mark is LinkMark => mark.type === 'link');
}

function inlineChildren(
  content: readonly Inline[],
  style: StyleName,
  context: BuildContext,
  runContext?: RunContext,
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  let index = 0;
  while (index < content.length) {
    const link = linkOf(content[index]);
    // Consecutive runs that share a link target belong to one hyperlink.
    let end = index + 1;
    while (link !== undefined && linkOf(content[end])?.href === link.href) end += 1;
    const runs = content.slice(index, end).map(
      (inline) =>
        new TextRun({
          children: textChildren(inline.text),
          ...context.runs.format(style, inline.marks, runContext),
        }),
    );
    if (link === undefined) children.push(...runs);
    else children.push(new ExternalHyperlink({ link: link.href, children: runs }));
    index = end;
  }
  return children;
}

/** Word bookmark names must start with a letter, and IDs can start with a digit. */
export function bookmarkName(id: NodeId): string {
  return `phrase_${id}`;
}

function paragraphOf(
  style: StyleName,
  ids: readonly NodeId[],
  children: ParagraphChild[],
  numbering?: ListPosition,
): Paragraph {
  return new Paragraph({
    style: wordStyleId(style),
    children: inBookmarks(ids, children),
    ...(numbering !== undefined ? { numbering: { ...numbering, custom: true } } : {}),
  });
}

/** The first ID is the outermost bookmark. */
function inBookmarks(ids: readonly NodeId[], children: ParagraphChild[]): ParagraphChild[] {
  return ids.reduceRight<ParagraphChild[]>(
    (inner, id) => [new Bookmark({ id: bookmarkName(id), children: inner })],
    children,
  );
}

const idsOf = (block: { readonly id?: NodeId }): NodeId[] =>
  block.id === undefined ? [] : [block.id];

function textBlock(
  block: Heading | ParagraphBlock,
  label: string | undefined,
  context: BuildContext,
): Paragraph {
  const style =
    block.style ?? (block.type === 'heading' ? defaultHeadingStyle(block.level) : BODY_STYLE);
  const content = inlineChildren(block.content, style, context);
  // The number is literal text, not a Word field, and the heading's style formats it.
  const children = label === undefined ? content : [new TextRun(`${label} `), ...content];
  return paragraphOf(style, idsOf(block), children);
}

function codeBlock(block: CodeBlock): Paragraph {
  const style = block.style ?? CODE_STYLE;
  const runs = block.text
    .split('\n')
    .map(
      (line, index) =>
        new TextRun({ children: textChildren(line), ...(index > 0 ? { break: 1 } : {}) }),
    );
  return paragraphOf(style, idsOf(block), runs);
}

function unsupported(block: Block | ListItemBlock, path: string, context: BuildContext): void {
  context.diagnostics.push({
    severity: 'error',
    code: 'docx-unsupported-block',
    message: `The DOCX export does not support ${block.type} blocks${path.includes('.items[') ? ' in list items' : ''} yet.`,
    path,
    ...(block.id !== undefined ? { nodeId: block.id } : {}),
  });
}

interface Parent {
  readonly reference: string;
  readonly instance: number;
}

/**
 * Maps a list to numbered paragraphs. Nested lists use the next level, and share the Word list of
 * their parent when they have the same kind of marker. The ID of the list goes on its first paragraph.
 */
function buildList(
  list: List,
  level: number,
  parent: Parent | undefined,
  path: string,
  context: BuildContext,
): Paragraph[] {
  if (level > MAX_LIST_LEVEL) {
    context.diagnostics.push({
      severity: 'error',
      code: 'docx-list-too-deep',
      message: `Word supports ${String(MAX_LIST_LEVEL + 1)} list levels.`,
      path,
      ...(list.id !== undefined ? { nodeId: list.id } : {}),
    });
    return [];
  }
  const style = list.style ?? LIST_STYLES[list.kind];
  const reference = context.lists.reference(style, list.kind);
  const instance = parent?.reference === reference ? parent.instance : context.lists.newInstance();
  const position: ListPosition = { reference, level, instance };
  const paragraphs: Paragraph[] = [];
  let pending = idsOf(list);

  list.items.forEach((item, itemIndex) => {
    const itemPath = `${path}.items[${String(itemIndex)}]`;
    const first = item.blocks[0];
    let next = 0;
    if (first?.type === 'paragraph') {
      const firstStyle = first.style ?? style;
      const children = inlineChildren(first.content, firstStyle, context);
      paragraphs.push(paragraphOf(firstStyle, [...pending, ...idsOf(first)], children, position));
      pending = [];
      next = 1;
    } else if (first === undefined || first.type === 'list') {
      // An item that starts with a nested list, or is empty, still has its marker.
      paragraphs.push(paragraphOf(style, pending, [], position));
      pending = [];
    }
    item.blocks.forEach((block, blockIndex) => {
      if (blockIndex < next) return;
      const blockPath = `${itemPath}.blocks[${String(blockIndex)}]`;
      if (block.type === 'paragraph') {
        paragraphs.push(continuation(block, style, level, context));
      } else if (block.type === 'list') {
        paragraphs.push(
          ...buildList(block, level + 1, { reference, instance }, blockPath, context),
        );
      } else {
        unsupported(block, blockPath, context);
      }
    });
  });
  return paragraphs;
}

/** A further paragraph of a list item, indented under the item's text without a marker. */
function continuation(
  block: ParagraphBlock,
  listStyle: StyleName,
  level: number,
  context: BuildContext,
): Paragraph {
  const style = block.style ?? listStyle;
  const children = inlineChildren(block.content, style, context);
  if (block.style !== undefined) return paragraphOf(block.style, idsOf(block), children);
  return new Paragraph({
    style: context.lists.continuationStyle(listStyle, level),
    children: inBookmarks(idsOf(block), children),
  });
}

/** `weight / total` as a percentage with two decimals, the form Word reads for relative widths. */
function percent(weight: number, total: number): `${number}%` {
  return `${String(Math.round((weight / total) * 10000) / 100)}%` as `${number}%`;
}

function tableCell(
  cell: TableCellBlock,
  style: StyleName,
  ids: readonly NodeId[],
  width: `${number}%` | undefined,
  context: BuildContext,
  runContext?: RunContext,
): TableCell {
  const children = inBookmarks(ids, inlineChildren(cell.content, style, context, runContext));
  return new TableCell({
    ...(width !== undefined ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
    children: [new Paragraph({ style: wordStyleId(style), children })],
  });
}

/**
 * Maps a table. The style's header-row text and background come from its first-row formatting;
 * header cells format their marks against a base that includes the header text properties.
 */
function buildTable(table: TableBlock, context: BuildContext): Table {
  const styleName = table.style ?? RESERVED_TABLE_STYLE;
  const resolved = resolveTableStyle(context.stylesheet, styleName);
  const cellStyle = resolved?.cellStyle ?? BODY_STYLE;
  const header = resolved?.headerRow;
  const runContext: RunContext | undefined =
    header === undefined
      ? undefined
      : {
          id: `${wordStyleId(styleName)}Header`,
          name: `${wordStyleName(styleName)} Header`,
          base: header.text,
        };
  const total = table.widths?.reduce((sum, weight) => sum + weight, 0);
  const width = (column: number): `${number}%` | undefined => {
    const weight = table.widths?.[column];
    return weight === undefined || total === undefined ? undefined : percent(weight, total);
  };

  const headerRow = new TableRow({
    ...(header?.repeat === true ? { tableHeader: true } : {}),
    cantSplit: true,
    children: table.header.map((cell, column) =>
      tableCell(
        cell,
        cellStyle,
        column === 0 ? idsOf(table) : [],
        width(column),
        context,
        runContext,
      ),
    ),
  });
  const rows = table.rows.map(
    (row) =>
      new TableRow({
        cantSplit: true,
        children: row.map((cell, column) => tableCell(cell, cellStyle, [], width(column), context)),
      }),
  );
  return new Table({
    style: wordStyleId(styleName),
    tableLook: { firstRow: header !== undefined, noHBand: true, noVBand: true },
    layout: TableLayoutType.AUTOFIT,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  });
}

/** Maps the blocks of a document. Blocks that cannot be mapped yet are reported and left out. */
export function buildBlocks(
  blocks: readonly Block[],
  context: BuildContext,
): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [];
  blocks.forEach((block, index) => {
    const path = `blocks[${String(index)}]`;
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        paragraphs.push(textBlock(block, context.headingLabels[index], context));
        break;
      case 'code':
        paragraphs.push(codeBlock(block));
        break;
      case 'list':
        paragraphs.push(...buildList(block, 0, undefined, path, context));
        break;
      case 'table':
        paragraphs.push(buildTable(block, context));
        // Word joins two tables that touch, and wants a paragraph after a table at the end.
        if (blocks[index + 1] === undefined || blocks[index + 1]?.type === 'table') {
          paragraphs.push(new Paragraph({ style: wordStyleId(BODY_STYLE) }));
        }
        break;
      case 'phrase':
        unsupported(block, path, context);
        break;
    }
  });
  return paragraphs;
}
