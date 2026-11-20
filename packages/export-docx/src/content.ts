import {
  BODY_STYLE,
  CODE_STYLE,
  LIST_STYLES,
  RESERVED_TABLE_STYLE,
  TOC_STANZA_KIND,
  defaultHeadingStyle,
  isNodeId,
  parseReferenceLink,
  resolveLink,
  type LinkSchemes,
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
} from '@stanza/core';
import {
  Bookmark,
  ExternalHyperlink,
  InternalHyperlink,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { bookmarkName } from './bookmark-name.js';
import { MAX_LIST_LEVEL, type ListNumbering } from './list-numbering.js';
import type { PageGeometry } from './page.js';
import type { RunContext, RunStyles } from './run-styles.js';
import { wordStyleId, wordStyleName } from './style-ids.js';
import { buildToc } from './toc.js';

export interface BuildContext {
  readonly linkSchemes: LinkSchemes;
  readonly stylesheet: Stylesheet;
  readonly page: PageGeometry;
  readonly runs: RunStyles;
  readonly lists: ListNumbering;
  /** The number of each top-level block, as `numberHeadings` gives them. */
  readonly headingLabels: readonly (string | undefined)[];
  readonly diagnostics: Diagnostic[];
  /** The blocks of the other documents of the project that a reference may point at. */
  readonly otherTargets: ReadonlyMap<string, ReferenceFile>;
}

/** Where a block of another document is: the DOCX file of its document, relative to this one. */
export interface ReferenceFile {
  readonly href: string;
  /** False when that document is not built, so the file will not be there. */
  readonly built: boolean;
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
    const reference = link === undefined ? undefined : parseReferenceLink(link.href);
    const target = reference?.target;
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
    else if (target !== undefined && isNodeId(target)) {
      const other = context.otherTargets.get(target);
      if (other === undefined) {
        // The validation has seen that the block is there, and every block with an ID has a bookmark.
        children.push(new InternalHyperlink({ anchor: bookmarkName(target), children: runs }));
      } else {
        if (!other.built) {
          const text = content
            .slice(index, end)
            .map((inline) => inline.text)
            .join('');
          context.diagnostics.push({
            severity: 'warning',
            code: 'reference-to-unbuilt-document',
            message: `The reference "${text}" points at a document that is not built, so its link has no file to go to.`,
          });
        }
        children.push(
          new ExternalHyperlink({ link: `${other.href}#${bookmarkName(target)}`, children: runs }),
        );
      }
    } else if (reference !== undefined && reference.file !== '') {
      const file = context.otherTargets.get(link.href);
      if (file === undefined) {
        context.diagnostics.push({
          severity: 'error',
          code: 'missing-linked-document',
          message: `The link "${link.href}" has no resolved document output.`,
        });
      } else {
        if (!file.built)
          context.diagnostics.push({
            severity: 'warning',
            code: 'reference-to-unbuilt-document',
            message: `The link "${link.href}" points at a document that is not built.`,
          });
        children.push(new ExternalHyperlink({ link: file.href, children: runs }));
      }
    } else {
      const target = resolveLink(link.href, context.linkSchemes);
      if (!target.ok)
        context.diagnostics.push({ severity: 'error', code: target.code, message: target.message });
      else children.push(new ExternalHyperlink({ link: target.href, children: runs }));
    }
    index = end;
  }
  return children;
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

interface ItemPosition {
  readonly listStyle: StyleName;
  readonly level: number;
}

/** A paragraph that continues a list item: the style indented under the text of the item. */
function inItem(
  style: StyleName,
  ids: readonly NodeId[],
  children: ParagraphChild[],
  item: ItemPosition,
  context: BuildContext,
): Paragraph {
  return new Paragraph({
    style: context.lists.continuationStyle(style, item.listStyle, item.level),
    children: inBookmarks(ids, children),
  });
}

function codeBlock(block: CodeBlock, context: BuildContext, item?: ItemPosition): Paragraph {
  const style = block.style ?? CODE_STYLE;
  const runs = block.text
    .split('\n')
    .map(
      (line, index) =>
        new TextRun({ children: textChildren(line), ...(index > 0 ? { break: 1 } : {}) }),
    );
  return item === undefined
    ? paragraphOf(style, idsOf(block), runs)
    : inItem(style, idsOf(block), runs, item, context);
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
): (Paragraph | Table)[] {
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
  const paragraphs: (Paragraph | Table)[] = [];
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
    } else {
      // An item that is empty or starts with something other than text still has its marker.
      paragraphs.push(paragraphOf(style, pending, [], position));
      pending = [];
    }
    const here: ItemPosition = { listStyle: style, level };
    item.blocks.forEach((block, blockIndex) => {
      if (blockIndex < next) return;
      const blockPath = `${itemPath}.blocks[${String(blockIndex)}]`;
      switch (block.type) {
        case 'paragraph':
          paragraphs.push(continuation(block, here, context));
          break;
        case 'code':
          paragraphs.push(codeBlock(block, context, here));
          break;
        case 'table':
          paragraphs.push(
            buildTable(block, context, blockPath, context.lists.textIndent(style, level)),
          );
          break;
        case 'list':
          paragraphs.push(
            ...buildList(block, level + 1, { reference, instance }, blockPath, context),
          );
          break;
        case 'stanza':
          unsupported(block, blockPath, context);
          break;
      }
    });
  });
  return paragraphs;
}

/** A further paragraph of a list item, indented under the item's text without a marker. */
function continuation(block: ParagraphBlock, item: ItemPosition, context: BuildContext): Paragraph {
  const style = block.style ?? item.listStyle;
  return inItem(style, idsOf(block), inlineChildren(block.content, style, context), item, context);
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
  path: string,
  runContext?: RunContext,
): TableCell {
  const paragraphs = cell.blocks.flatMap((block, index): Paragraph[] => {
    if (block.type === 'list') {
      // The lists of a cell are numbered like any other, from the stylesheet's list styles.
      return buildList(block, 0, undefined, `${path}.blocks[${String(index)}]`, context).filter(
        (child): child is Paragraph => child instanceof Paragraph,
      );
    }
    const children = inBookmarks(
      index === 0 ? ids : [],
      inlineChildren(block.content, style, context, runContext),
    );
    return [new Paragraph({ style: wordStyleId(style), children })];
  });
  // Word needs a paragraph in every cell.
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ style: wordStyleId(style), children: inBookmarks(ids, []) }));
  }
  return new TableCell({
    ...(width !== undefined ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
    children: paragraphs,
  });
}

/**
 * Maps a table. The style's header-row text and background come from its first-row formatting;
 * header cells format their marks against a base that includes the header text properties. A
 * table in a list item is indented under the item's text, and narrowed to stay in the margin.
 */
function buildTable(
  table: TableBlock,
  context: BuildContext,
  path: string,
  indentTwips = 0,
): Table {
  const styleName = table.style ?? RESERVED_TABLE_STYLE;
  const resolved = resolveTableStyle(context.stylesheet, styleName);
  const cellStyle = resolved?.cellStyle ?? BODY_STYLE;
  const header = resolved?.headerRow;
  const runContext: RunContext | undefined =
    header === undefined
      ? undefined
      : {
          id: `${wordStyleId(styleName)}Header`,
          name: `${wordStyleName(styleName, context.stylesheet.tableStyles.get(styleName)?.label)} Header`,
          base: header.text,
        };
  const total = table.widths?.reduce((sum, weight) => sum + weight, 0);
  const width = (column: number): `${number}%` | undefined => {
    const weight = table.widths?.[column];
    return weight === undefined || total === undefined ? undefined : percent(weight, total);
  };

  const hasHeader = header !== undefined && table.header.length > 0;
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
        `${path}.header[${String(column)}]`,
        runContext,
      ),
    ),
  });
  const rows = table.rows.map(
    (row, rowIndex) =>
      new TableRow({
        cantSplit: true,
        children: row.map((cell, column) =>
          tableCell(
            cell,
            cellStyle,
            [],
            width(column),
            context,
            `${path}.rows[${String(rowIndex)}][${String(column)}]`,
          ),
        ),
      }),
  );
  return new Table({
    style: wordStyleId(styleName),
    tableLook: { firstRow: hasHeader, noHBand: resolved?.bandedRows === undefined, noVBand: true },
    layout: TableLayoutType.AUTOFIT,
    width:
      indentTwips > 0
        ? {
            size: percent(context.page.textWidthTwips - indentTwips, context.page.textWidthTwips),
            type: WidthType.PERCENTAGE,
          }
        : { size: 100, type: WidthType.PERCENTAGE },
    ...(indentTwips > 0 ? { indent: { size: indentTwips, type: WidthType.DXA } } : {}),
    rows: table.header.length === 0 ? rows : [headerRow, ...rows],
  });
}

/** Word joins two tables that touch, and wants a paragraph after a table at the end. */
function separateTables(children: readonly Child[]): Child[] {
  const spacer = (): Paragraph => new Paragraph({ style: wordStyleId(BODY_STYLE) });
  const result: Child[] = [];
  for (const child of children) {
    if (child instanceof Table && result.at(-1) instanceof Table) result.push(spacer());
    result.push(child);
  }
  if (result.at(-1) instanceof Table) result.push(spacer());
  return result;
}

/** What a document body is made of. */
type Child = Paragraph | Table | TableOfContents;

/** Maps the blocks of a document. Blocks that cannot be mapped yet are reported and left out. */
export function buildBlocks(blocks: readonly Block[], context: BuildContext): Child[] {
  const paragraphs: Child[] = [];
  blocks.forEach((block, index) => {
    const path = `blocks[${String(index)}]`;
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        paragraphs.push(textBlock(block, context.headingLabels[index], context));
        break;
      case 'code':
        paragraphs.push(codeBlock(block, context));
        break;
      case 'list':
        paragraphs.push(...buildList(block, 0, undefined, path, context));
        break;
      case 'table':
        paragraphs.push(buildTable(block, context, path));
        break;
      case 'stanza':
        if (block.kind === TOC_STANZA_KIND) paragraphs.push(...buildToc(block, blocks, context));
        else unsupported(block, path, context);
        break;
    }
  });
  return separateTables(paragraphs);
}
