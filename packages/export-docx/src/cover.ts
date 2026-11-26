import {
  BODY_STYLE,
  coverAreaHeightPt,
  coverMargins,
  coverColumnWidthsPt,
  coverGrid,
  coverRowHeightsPt,
  fillCover,
  fillEntries,
  fillGrid,
  naturalWidthPt,
  type Block,
  type CoverItem,
  type CoverGrid,
  type DocumentMeta,
  type FilledArea,
  type ImageAsset,
  type PageTemplate,
} from '@stanza/core';
import {
  HeightRule,
  ShadingType,
  ImageRun,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  VerticalAlignTable,
  WidthType,
} from 'docx';
import { buildBlocks, type BuildContext, type Child } from './content.js';
import { colorHex } from './docx-props.js';
import { pageGeometry, type PageGeometry } from './page.js';
import { wordStyleId } from './style-ids.js';

/** A cover as Word content: its own page and what goes on it (ADR 0019, ADR 0089, ADR 0092). */
export interface CoverSection {
  readonly page: PageGeometry;
  readonly children: readonly Child[];
  /** True for a cover of rows or a grid, which is one layout table. */
  readonly rows: boolean;
}

const twips = (pt: number): number => Math.round(pt * 20);

/** Pixels at 96 per inch, which the library takes for the size of an image. */
const pixels = (pt: number): number => (pt * 96) / 72;

/**
 * An image in a paragraph of its style, as wide as asked or as it is, and never wider than
 * `maxWidthPt`, with its aspect ratio kept. An image that was not loaded is reported, since the
 * project reads the images and the exporter cannot.
 */
function imageParagraph(
  item: CoverItem & { kind: 'image' },
  images: ReadonlyMap<string, ImageAsset>,
  maxWidthPt: number,
  context: BuildContext,
): Paragraph | undefined {
  const { image } = item;
  const asset = images.get(image.path);
  if (asset === undefined) {
    context.diagnostics.push({
      severity: 'error',
      code: 'image-not-found',
      message: `The image "${image.path}" was not loaded with the document.`,
    });
    return undefined;
  }
  const widthPt = Math.min(image.widthPt ?? naturalWidthPt(asset), maxWidthPt);
  const heightPt = (widthPt * asset.heightPx) / asset.widthPx;
  const name = image.path.slice(image.path.lastIndexOf('/') + 1);
  return new Paragraph({
    style: wordStyleId(image.style ?? BODY_STYLE),
    children: [
      new ImageRun({
        type: asset.format === 'png' ? 'png' : 'jpg',
        data: asset.bytes,
        transformation: { width: pixels(widthPt), height: pixels(heightPt) },
        altText: { name, description: '', title: '' },
      }),
    ],
  });
}

/** The items of a row in order; runs of blocks are built together, as in a document. */
function itemChildren(
  items: readonly CoverItem[],
  images: ReadonlyMap<string, ImageAsset>,
  maxWidthPt: number,
  context: BuildContext,
): Child[] {
  const children: Child[] = [];
  let blocks: Block[] = [];
  const flush = (): void => {
    if (blocks.length > 0) children.push(...buildBlocks(blocks, context));
    blocks = [];
  };
  for (const item of items) {
    if (item.kind === 'block') {
      blocks.push(item.block);
      continue;
    }
    flush();
    const paragraph = imageParagraph(item, images, maxWidthPt, context);
    if (paragraph !== undefined) children.push(paragraph);
  }
  flush();
  return children;
}

/**
 * Sizes in twips, or undefined for a row that grows. The shares are rounded, and the last share
 * takes what the rounding leaves, so that the sizes add up as computed.
 */
function sizesTwips(
  kinds: readonly ('points' | 'share' | 'auto')[],
  sizesPt: readonly (number | undefined)[],
): (number | undefined)[] {
  const result = sizesPt.map((pt) => (pt === undefined ? undefined : twips(pt)));
  const shares = kinds.flatMap((kind, index) => (kind === 'share' ? [index] : []));
  const last = shares.at(-1);
  if (last !== undefined) {
    const total = twips(shares.reduce((sum, index) => sum + (sizesPt[index] ?? 0), 0));
    const others = shares.slice(0, -1).reduce((sum, index) => sum + (result[index] ?? 0), 0);
    result[last] = Math.max(0, total - others);
  }
  return result;
}

const VALIGN = {
  top: VerticalAlignTable.TOP,
  center: VerticalAlignTable.CENTER,
  bottom: VerticalAlignTable.BOTTOM,
} as const;

/** The fill of an area with a background (ADR 0093), as cell shading of the token's color. */
function shadingOf(area: FilledArea, context: BuildContext) {
  const fill =
    area.background === undefined
      ? undefined
      : colorHex(context.stylesheet.tokens, area.background);
  return fill === undefined ? {} : { shading: { type: ShadingType.CLEAR, color: 'auto', fill } };
}

const emptyParagraph = (): Paragraph => new Paragraph({ style: wordStyleId(BODY_STYLE) });

/**
 * The grid of a cover as one borderless table as wide as the text (ADR 0089, ADR 0092): a column
 * for each column, a row for each row, and a cell for each area that spans its columns and rows. Its
 * borders, widths, cell margins, row heights and alignment are explicit, as layout that the
 * stylesheet computes.
 */
function layoutTable(
  grid: CoverGrid,
  areas: readonly FilledArea[],
  template: PageTemplate,
  page: PageGeometry,
  images: ReadonlyMap<string, ImageAsset>,
  context: BuildContext,
): Table {
  const width = page.textWidthTwips;
  const columns = sizesTwips(
    grid.columns.map((column) => column.kind),
    coverColumnWidthsPt(grid.columns, width / 20),
  ).map((value) => value ?? 0);
  const heights = sizesTwips(
    grid.rows.map((row) => row.kind),
    coverRowHeightsPt(grid.rows, coverAreaHeightPt(template)),
  );
  const span = (from: number, count: number): number =>
    columns.slice(from, from + count).reduce((sum, value) => sum + value, 0);
  const owner = (row: number, column: number): FilledArea | undefined =>
    areas.find(
      (area) =>
        row >= area.row &&
        row < area.row + area.rowSpan &&
        column >= area.column &&
        column < area.column + area.columnSpan,
    );
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: width, type: WidthType.DXA },
    columnWidths: columns,
    borders: TableBorders.NONE,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    rows: grid.rows.map((_, row) => {
      const height = heights[row];
      const cells: TableCell[] = [];
      columns.forEach((columnWidth, column) => {
        const area = owner(row, column);
        if (area === undefined) {
          cells.push(
            new TableCell({
              width: { size: columnWidth, type: WidthType.DXA },
              children: [emptyParagraph()],
            }),
          );
          return;
        }
        // The library writes the cells below the first row of an area that spans rows.
        if (area.row !== row || area.column !== column) return;
        const areaWidth = span(area.column, area.columnSpan);
        // A cover has no table of contents, so its children are paragraphs and tables.
        const children = itemChildren(area.items, images, areaWidth / 20, context).filter(
          (child): child is Paragraph | Table =>
            child instanceof Paragraph || child instanceof Table,
        );
        cells.push(
          new TableCell({
            width: { size: areaWidth, type: WidthType.DXA },
            verticalAlign: VALIGN[area.valign],
            ...shadingOf(area, context),
            ...(area.columnSpan > 1 ? { columnSpan: area.columnSpan } : {}),
            ...(area.rowSpan > 1 ? { rowSpan: area.rowSpan } : {}),
            children: children.length > 0 ? children : [emptyParagraph()],
          }),
        );
      });
      return new TableRow({
        cantSplit: true,
        ...(height !== undefined ? { height: { value: height, rule: HeightRule.EXACT } } : {}),
        children: cells,
      });
    }),
  });
}

/**
 * The cover of a template for a document, or undefined when the template has none or nothing on it
 * is left once the metadata is filled in.
 */
export function buildCover(
  template: PageTemplate,
  meta: DocumentMeta,
  images: ReadonlyMap<string, ImageAsset>,
  context: BuildContext,
): CoverSection | undefined {
  const { cover } = template;
  if (cover === undefined) return undefined;
  const page = pageGeometry({ ...template, margins: coverMargins(template) });
  const here: BuildContext = { ...context, page, headingLabels: [] };
  if (cover.kind === 'list') {
    const items = fillCover(cover, meta)?.flatMap((row) => row.items) ?? [];
    const children = itemChildren(items, images, page.textWidthTwips / 20, here);
    return children.length === 0 ? undefined : { page, children, rows: false };
  }
  const grid = coverGrid(cover);
  const areas = fillGrid(grid, meta);
  if (areas === undefined) return undefined;
  return { page, children: [layoutTable(grid, areas, template, page, images, here)], rows: true };
}

/**
 * The title block of a template for a document (ADR 0090): its entries with the metadata filled
 * in, as paragraphs, tables and images as wide as the body text at most. Nothing when the template
 * has none or nothing on it is left.
 */
export function buildTitleBlock(
  template: PageTemplate,
  meta: DocumentMeta,
  images: ReadonlyMap<string, ImageAsset>,
  context: BuildContext,
): Child[] {
  const items = fillEntries(template.titleBlock ?? [], meta);
  if (items.length === 0) return [];
  const here: BuildContext = { ...context, headingLabels: [] };
  return itemChildren(items, images, context.page.textWidthTwips / 20, here);
}
