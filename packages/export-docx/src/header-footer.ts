import {
  BODY_STYLE,
  coverRowHeightsPt,
  defaultHeadingStyle,
  fillEntries,
  placeAreas,
  slotValue,
  type ColorValue,
  type CoverAlignment,
  type CoverEntry,
  type DocumentMeta,
  type HeaderFooter,
  type ImageAsset,
  type PlacedArea,
  type SlotPart,
} from '@stanza/core';
import {
  Footer,
  Header,
  LineRuleType,
  Paragraph,
  SimpleField,
  Tab,
  TabStopType,
  Table,
  TextRun,
  type ParagraphChild,
} from 'docx';
import { buildBlocks, type BuildContext } from './content.js';
import { gridTable, imageParagraph } from './cover.js';
import type { PageGeometry } from './page.js';
import { wordStyleId, wordStyleName } from './style-ids.js';

/** What a header or footer that is a grid needs besides its spec (ADR 0095). */
export interface GridParts {
  readonly images: ReadonlyMap<string, ImageAsset>;
  readonly context: BuildContext;
}

/** A run, or nothing for empty text, which would leave an empty run in the file. */
const textRun = (text: string): ParagraphChild | undefined =>
  text === '' ? undefined : new TextRun(text);

/** With a cover, the body is its own section and its pages are counted without the cover. */
interface Counting {
  readonly hasCover: boolean;
}

const slotChildren = (
  parts: readonly SlotPart[],
  meta: DocumentMeta,
  counting: Counting,
): ParagraphChild[] => parts.flatMap((part) => partChild(part, meta, counting) ?? []);

/** The text of a token: its value, or its label while it has no value. Fields get the label as their cached result. */
function partChild(
  part: SlotPart,
  meta: DocumentMeta,
  counting: Counting,
): ParagraphChild | undefined {
  if (part.kind === 'text') return textRun(part.text);
  if (part.kind === 'field') return textRun(slotValue(part, meta) ?? part.label);
  switch (part.token) {
    case 'page':
      return new SimpleField('PAGE', part.label);
    case 'pages':
      return new SimpleField(counting.hasCover ? 'SECTIONPAGES' : 'NUMPAGES', part.label);
    case 'section':
      return new SimpleField(`STYLEREF "${wordStyleName(defaultHeadingStyle(1))}"`, part.label);
    default:
      return textRun(slotValue(part, meta) ?? part.label);
  }
}

const isEmpty = (parts: readonly SlotPart[]): boolean =>
  parts.every((part) => part.kind === 'text' && part.text === '');

/**
 * The line of a header or footer, or undefined when all three slots are empty. The slots are
 * separated by tabs, with a centre tab at the middle of the text and a right tab at its edge.
 */
function line(
  spec: HeaderFooter,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
): Paragraph | undefined {
  const { left, center, right } = spec;
  if (isEmpty(left) && isEmpty(center) && isEmpty(right)) return undefined;
  const tab = (): ParagraphChild => new TextRun({ children: [new Tab()] });
  const children: ParagraphChild[] = slotChildren(left, meta, counting);
  const needsTabs = !isEmpty(center) || !isEmpty(right);
  if (needsTabs) children.push(tab(), ...slotChildren(center, meta, counting));
  if (!isEmpty(right)) children.push(tab(), ...slotChildren(right, meta, counting));
  return new Paragraph({
    style: wordStyleId(spec.style ?? BODY_STYLE),
    children,
    ...(needsTabs
      ? {
          tabStops: [
            { type: TabStopType.CENTER, position: Math.round(page.textWidthTwips / 2) },
            { type: TabStopType.RIGHT, position: page.textWidthTwips },
          ],
        }
      : {}),
  });
}

interface HeaderArea extends PlacedArea {
  readonly valign: CoverAlignment;
  readonly background?: ColorValue;
  readonly content: readonly CoverEntry[];
}

/**
 * Word ends a header or a footer with a paragraph; after a table it is one line of 1 pt with no
 * spacing, so that it adds nothing to the height (ADR 0095).
 */
const endParagraph = (): Paragraph =>
  new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    run: { size: 2 },
  });

/**
 * A header or a footer that is a grid (ADR 0095): the layout table of a cover grid as wide as the
 * text, with rows that grow or have points. Its entries keep the page fields, which a cover cannot
 * have. Undefined when nothing in it has content.
 */
function gridContent(
  spec: HeaderFooter,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
  parts: GridParts,
): (Paragraph | Table)[] | undefined {
  const grid = spec.grid;
  if (grid === undefined) return undefined;
  const style = wordStyleId(spec.style ?? BODY_STYLE);
  const entryChildren = (entry: CoverEntry, widthPt: number): (Paragraph | Table)[] => {
    if (entry.kind === 'paragraph') {
      const children = slotChildren(entry.text, meta, counting);
      if (children.length === 0) return [];
      return [
        new Paragraph({
          style: entry.style === undefined ? style : wordStyleId(entry.style),
          children,
        }),
      ];
    }
    if (entry.kind === 'image') {
      const paragraph = imageParagraph(
        { kind: 'image', image: entry },
        parts.images,
        widthPt,
        parts.context,
      );
      return paragraph === undefined ? [] : [paragraph];
    }
    const blocks = fillEntries([entry], meta).flatMap((item) =>
      item.kind === 'block' ? [item.block] : [],
    );
    return buildBlocks(blocks, parts.context).filter(
      (child): child is Paragraph | Table => child instanceof Paragraph || child instanceof Table,
    );
  };
  const areas: HeaderArea[] = placeAreas(grid.areas, grid.columns.length).areas.map((placed) => {
    const area = grid.area[placed.name];
    return {
      ...placed,
      valign: area?.valign ?? 'top',
      ...(area?.background !== undefined ? { background: area.background } : {}),
      content: area?.content ?? [],
    };
  });
  const filled = areas.some((area) =>
    area.content.some((entry) =>
      entry.kind === 'paragraph' ? slotChildren(entry.text, meta, counting).length > 0 : true,
    ),
  );
  if (!filled) return undefined;
  const table = gridTable(
    grid,
    areas,
    page.textWidthTwips,
    coverRowHeightsPt(grid.rows, 0),
    (area, widthPt) => area.content.flatMap((entry) => entryChildren(entry, widthPt)),
    parts.context,
  );
  return [table, endParagraph()];
}

function content(
  spec: HeaderFooter | undefined,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
  parts: GridParts,
): (Paragraph | Table)[] | undefined {
  if (spec === undefined) return undefined;
  if (spec.grid !== undefined) return gridContent(spec, meta, page, counting, parts);
  const paragraph = line(spec, meta, page, counting);
  return paragraph === undefined ? undefined : [paragraph];
}

export function headerOf(
  spec: HeaderFooter | undefined,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
  parts: GridParts,
): Header | undefined {
  const children = content(spec, meta, page, counting, parts);
  return children === undefined ? undefined : new Header({ children });
}

export function footerOf(
  spec: HeaderFooter | undefined,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
  parts: GridParts,
): Footer | undefined {
  const children = content(spec, meta, page, counting, parts);
  return children === undefined ? undefined : new Footer({ children });
}
