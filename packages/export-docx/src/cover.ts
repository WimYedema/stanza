import {
  BODY_STYLE,
  coverAreaHeightPt,
  coverMargins,
  coverRowHeightsPt,
  fillCover,
  naturalWidthPt,
  type Block,
  type CoverItem,
  type DocumentMeta,
  type FilledCoverRow,
  type ImageAsset,
  type PageTemplate,
} from '@stanza/core';
import {
  HeightRule,
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
import { pageGeometry, type PageGeometry } from './page.js';
import { wordStyleId } from './style-ids.js';

/** A cover as Word content: its own page and what goes on it (ADR 0019, ADR 0089). */
export interface CoverSection {
  readonly page: PageGeometry;
  readonly children: readonly Child[];
  /** True for a cover of rows, which is one layout table. */
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
      code: 'cover-image-not-found',
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
 * The heights of the rows in twips, or undefined for one that grows. The shares are rounded, and
 * the last share row takes what the rounding leaves, so that the rows add up as computed.
 */
function rowHeightsTwips(rows: readonly FilledCoverRow[], template: PageTemplate) {
  const heights = coverRowHeightsPt(
    rows.map((row) => row.height),
    coverAreaHeightPt(template),
  );
  const result = heights.map((pt) => (pt === undefined ? undefined : twips(pt)));
  const shares = rows.flatMap((row, index) => (row.height.kind === 'share' ? [index] : []));
  const last = shares.at(-1);
  if (last !== undefined) {
    const total = twips(shares.reduce((sum, index) => sum + (heights[index] ?? 0), 0));
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

/**
 * The rows of a cover as one borderless table as wide as the text, with one column. Its borders,
 * widths, cell margins, row heights and alignment are explicit, as layout that the stylesheet
 * computes (ADR 0089).
 */
function layoutTable(
  rows: readonly FilledCoverRow[],
  template: PageTemplate,
  page: PageGeometry,
  images: ReadonlyMap<string, ImageAsset>,
  context: BuildContext,
): Table {
  const width = page.textWidthTwips;
  const heights = rowHeightsTwips(rows, template);
  const widthPt = width / 20;
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: width, type: WidthType.DXA },
    columnWidths: [width],
    borders: TableBorders.NONE,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    rows: rows.map((row, index) => {
      const height = heights[index];
      // A cover has no table of contents, so its children are paragraphs and tables.
      const children = itemChildren(row.items, images, widthPt, context).filter(
        (child): child is Paragraph | Table => child instanceof Paragraph || child instanceof Table,
      );
      return new TableRow({
        cantSplit: true,
        ...(height !== undefined ? { height: { value: height, rule: HeightRule.EXACT } } : {}),
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            verticalAlign: VALIGN[row.valign],
            children:
              children.length > 0 ? children : [new Paragraph({ style: wordStyleId(BODY_STYLE) })],
          }),
        ],
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
  const rows = fillCover(cover, meta);
  if (rows === undefined) return undefined;
  const page = pageGeometry({ ...template, margins: coverMargins(template) });
  const here: BuildContext = { ...context, page, headingLabels: [] };
  if (cover.kind === 'list') {
    const items = rows.flatMap((row) => row.items);
    const children = itemChildren(items, images, page.textWidthTwips / 20, here);
    return children.length === 0 ? undefined : { page, children, rows: false };
  }
  return { page, children: [layoutTable(rows, template, page, images, here)], rows: true };
}
