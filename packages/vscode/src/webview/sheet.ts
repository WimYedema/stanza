import {
  BODY_STYLE,
  BUILT_IN_PAGE_TEMPLATE,
  PAGE_SIZES,
  PAGE_TEMPLATE_FIELD,
  RESERVED_TABLE_STYLE,
  applyDefaults,
  coverAreaHeightPt,
  coverAreaWidthPt,
  coverColumnWidthsPt,
  coverGrid,
  coverMargins,
  coverRowHeightsPt,
  fillCover,
  fillGrid,
  fillEntries,
  numberHeadings,
  resolvePageTemplate,
  resolveTableStyle,
  slotValue,
  type Block,
  type CoverAlignment,
  type CoverItem,
  type Document,
  type DocumentMeta,
  type HeaderFooter,
  type PageTemplate,
  type ProjectDefaults,
  type SlotPart,
  type Stylesheet,
} from '@stanza/core';
import { paragraphClass, tableClass } from '@stanza/css';

/**
 * The paper look of the editor (ADR 0028): the page of the selected template around the text, with
 * its header and footer in the margins, the cover as a sheet of its own with its rows, margins and
 * images (ADR 0089, item 222), and the title block above the text (ADR 0090). It is a view of the
 * template and the metadata. Nothing here is part of the document, and there is no pagination.
 */

/** Where Word puts a header and a footer from the edge of the page: 1.25 cm (ADR 0016). */
const BAND_DISTANCE_PT = 35.4;

/** The class that the CSS of the stylesheet is scoped to, so that its rules reach the parts here. */
const SCOPE = 'stanza-document';

export interface SheetInput {
  readonly stylesheet: Stylesheet;
  readonly defaults: ProjectDefaults;
  readonly document: Document;
  /**
   * The images of the covers and title blocks as data URLs, by their path in the project. An
   * image that is not here is shown as a placeholder with its path.
   */
  readonly images?: ReadonlyMap<string, string>;
}

export interface SheetElements {
  readonly cover: HTMLElement;
  /** The title block above the text (ADR 0090): from the template, not part of the document. */
  readonly titleBlock?: HTMLElement;
  readonly header: HTMLElement;
  readonly footer: HTMLElement;
  /** The nonce of the content security policy, for the style element of the page geometry. */
  readonly nonce?: string;
}

export interface Sheet {
  /** Draws the sheet again with what changed. Nothing is drawn before all three parts are known. */
  update(patch: Partial<SheetInput>): void;
}

const number = (value: number): string => String(Math.round(value * 1000) / 1000);
const pt = (value: number): string => (value === 0 ? '0' : `${number(value)}pt`);

/** The rules of the size of the sheet and of the places of the header and the footer. */
export function sheetCss(template: PageTemplate): string {
  const { widthPt, heightPt } = PAGE_SIZES[template.size];
  const { topPt, rightPt, bottomPt, leftPt } = template.margins;
  const band = (margin: number): string => pt(Math.min(BAND_DISTANCE_PT, margin / 2));
  return `#desk.paper .sheet {
  width: ${pt(widthPt)};
  min-height: ${pt(heightPt)};
  padding: ${pt(topPt)} ${pt(rightPt)} ${pt(bottomPt)} ${pt(leftPt)};
}
#desk.paper .band { left: ${pt(leftPt)}; right: ${pt(rightPt)}; }
#desk.paper #header { top: ${band(topPt)}; }
#desk.paper #footer { bottom: ${band(bottomPt)}; }
`;
}

/** The template of the document, or the default one when the document names none that exists. */
export function templateOf(stylesheet: Stylesheet, meta: DocumentMeta): PageTemplate {
  const name = meta.fields[PAGE_TEMPLATE_FIELD];
  const chosen = typeof name === 'string' ? resolvePageTemplate(stylesheet, name) : undefined;
  return chosen ?? resolvePageTemplate(stylesheet) ?? BUILT_IN_PAGE_TEMPLATE;
}

/** The first level 1 heading, with its number, which is what `section` shows. */
export function sectionOf(document: Document, stylesheet: Stylesheet): string | undefined {
  const index = document.blocks.findIndex((block) => block.type === 'heading' && block.level === 1);
  const block = document.blocks[index];
  if (block?.type !== 'heading') return undefined;
  const text = block.content.map((inline) => inline.text).join('');
  const label = numberHeadings(document, stylesheet).labels[index];
  return label === undefined ? text : `${label} ${text}`;
}

const isEmpty = (parts: readonly SlotPart[]): boolean =>
  parts.every((part) => part.kind === 'text' && part.text === '');

/** Page numbers are Word fields, so here they only show the label that Word shows until it updates. */
const PAGE_FIELDS: readonly string[] = ['page', 'pages'];

function slotNodes(
  parts: readonly SlotPart[],
  meta: DocumentMeta,
  section: string | undefined,
): Node[] {
  return parts.map((part): Node => {
    if (part.kind === 'text') return document.createTextNode(part.text);
    const span = document.createElement('span');
    if (part.kind === 'token' && PAGE_FIELDS.includes(part.token)) {
      span.className = 'field';
      span.title = 'Word fills in the page number. Here is only its placeholder.';
      span.textContent = part.label;
      return span;
    }
    const value =
      part.kind === 'token' && part.token === 'section' ? section : slotValue(part, meta);
    span.textContent = value ?? part.label;
    return span;
  });
}

/** The line of a header or a footer, in the three slots, or nothing when all of them are empty. */
function drawBand(
  root: HTMLElement,
  spec: HeaderFooter | undefined,
  meta: DocumentMeta,
  section: string | undefined,
): void {
  root.replaceChildren();
  root.hidden =
    spec === undefined || (isEmpty(spec.left) && isEmpty(spec.center) && isEmpty(spec.right));
  if (spec === undefined || root.hidden) return;
  const line = document.createElement('div');
  line.className = `slots ${paragraphClass(spec.style ?? BODY_STYLE)}`;
  for (const [name, parts] of [
    ['left', spec.left],
    ['center', spec.center],
    ['right', spec.right],
  ] as const) {
    const slot = document.createElement('span');
    slot.className = `slot-${name}`;
    slot.append(...slotNodes(parts, meta, section));
    line.append(slot);
  }
  root.append(line);
}

const textOf = (block: Block): string =>
  block.type === 'paragraph' ? block.content.map((inline) => inline.text).join('') : '';

/** A paragraph or a table of a cover, with the classes of its styles, as the editor writes them. */
function blockElement(block: Block, stylesheet: Stylesheet): HTMLElement | undefined {
  if (block.type === 'paragraph') {
    const paragraph = document.createElement('p');
    paragraph.className = paragraphClass(block.style ?? BODY_STYLE);
    paragraph.textContent = textOf(block);
    return paragraph;
  }
  if (block.type !== 'table') return undefined;
  const style = block.style ?? RESERVED_TABLE_STYLE;
  const cellStyle = resolveTableStyle(stylesheet, style)?.cellStyle;
  const table = document.createElement('table');
  table.className = tableClass(style);
  const body = table.createTBody();
  for (const row of block.rows) {
    const tr = body.insertRow();
    for (const cell of row) {
      const td = tr.insertCell();
      td.className = paragraphClass(cellStyle ?? BODY_STYLE);
      td.textContent = cell.blocks
        .flatMap((cellBlock) => (cellBlock.type === 'paragraph' ? [textOf(cellBlock)] : []))
        .join(' ');
    }
  }
  return table;
}

/**
 * An image in a paragraph of its style, as wide as asked or as it is, and never wider than its
 * place, with its aspect ratio kept, as Word shows it. One that the host did not send is a
 * placeholder that names its path.
 */
function imageElement(
  item: CoverItem & { kind: 'image' },
  images: ReadonlyMap<string, string>,
): HTMLElement {
  const { image } = item;
  const paragraph = document.createElement('p');
  paragraph.className = paragraphClass(image.style ?? BODY_STYLE);
  const source = images.get(image.path);
  if (source === undefined) {
    const missing = document.createElement('span');
    missing.className = 'image-missing';
    missing.textContent = `[${image.path}]`;
    missing.title = 'The image is not in the project, or is not a PNG or JPEG file.';
    paragraph.append(missing);
    return paragraph;
  }
  const picture = document.createElement('img');
  picture.src = source;
  picture.alt = '';
  if (image.widthPt !== undefined) picture.style.width = pt(image.widthPt);
  picture.style.maxWidth = '100%';
  picture.style.height = 'auto';
  paragraph.append(picture);
  return paragraph;
}

function itemElements(
  items: readonly CoverItem[],
  stylesheet: Stylesheet,
  images: ReadonlyMap<string, string>,
): HTMLElement[] {
  return items.flatMap((item) => {
    const element =
      item.kind === 'image' ? imageElement(item, images) : blockElement(item.block, stylesheet);
    return element === undefined ? [] : [element];
  });
}

const JUSTIFY: Readonly<Record<CoverAlignment, string>> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
};

/**
 * The cover on its sheet. A list is drawn from the top. Rows get the heights that the export
 * writes, their alignment, and the margins of the cover; content that does not fit its row is cut
 * off, as in Word.
 */
export function drawCover(
  root: HTMLElement,
  template: PageTemplate,
  meta: DocumentMeta,
  stylesheet: Stylesheet,
  images: ReadonlyMap<string, string>,
): void {
  root.replaceChildren();
  root.style.padding = '';
  const cover = template.cover;
  root.hidden = true;
  if (cover === undefined) return;
  if (cover.kind === 'list') {
    const rows = fillCover(cover, meta);
    root.hidden = rows === undefined;
    root.append(
      ...itemElements(
        (rows ?? []).flatMap((row) => row.items),
        stylesheet,
        images,
      ),
    );
    return;
  }
  const grid = coverGrid(cover);
  const areas = fillGrid(grid, meta);
  root.hidden = areas === undefined;
  if (areas === undefined) return;
  const margins = coverMargins(template);
  root.style.padding = [margins.topPt, margins.rightPt, margins.bottomPt, margins.leftPt]
    .map(pt)
    .join(' ');
  const widths = coverColumnWidthsPt(grid.columns, coverAreaWidthPt(template));
  const heights = coverRowHeightsPt(grid.rows, coverAreaHeightPt(template));
  const layout = document.createElement('div');
  layout.className = 'cover-grid';
  layout.style.display = 'grid';
  layout.style.setProperty('grid-template-columns', widths.map(pt).join(' '));
  layout.style.setProperty(
    'grid-template-rows',
    heights.map((height) => (height === undefined ? 'auto' : pt(height))).join(' '),
  );
  for (const area of areas) {
    const element = document.createElement('div');
    element.className = 'cover-area';
    element.dataset['area'] = area.name;
    element.dataset['row'] = String(area.row + 1);
    element.dataset['column'] = String(area.column + 1);
    element.style.setProperty('grid-row', `${String(area.row + 1)} / span ${String(area.rowSpan)}`);
    element.style.setProperty(
      'grid-column',
      `${String(area.column + 1)} / span ${String(area.columnSpan)}`,
    );
    const spanned = heights.slice(area.row, area.row + area.rowSpan);
    if (spanned.every((height) => height !== undefined)) {
      element.style.height = pt(spanned.reduce<number>((sum, height) => sum + height, 0));
      element.style.overflow = 'hidden';
    }
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.justifyContent = JUSTIFY[area.valign];
    const background = area.background;
    const fill =
      background === undefined
        ? undefined
        : background.kind === 'hex'
          ? background.hex
          : stylesheet.tokens.colors.get(background.name);
    if (fill !== undefined) element.style.backgroundColor = fill;
    element.append(...itemElements(area.items, stylesheet, images));
    layout.append(element);
  }
  root.append(layout);
}

/** The title block above the text (ADR 0090), or nothing when no entry is left. */
export function drawTitleBlock(
  root: HTMLElement,
  template: PageTemplate,
  meta: DocumentMeta,
  stylesheet: Stylesheet,
  images: ReadonlyMap<string, string>,
): void {
  const items = fillEntries(template.titleBlock ?? [], meta);
  root.replaceChildren(...itemElements(items, stylesheet, images));
  root.hidden = items.length === 0;
}

export function createSheet(elements: SheetElements): Sheet {
  const style = document.createElement('style');
  if (elements.nonce !== undefined) style.setAttribute('nonce', elements.nonce);
  document.head.append(style);
  const roots = [elements.cover, elements.titleBlock, elements.header, elements.footer];
  for (const root of roots) root?.classList.add(SCOPE);

  let state: Partial<SheetInput> = {};
  return {
    update(patch) {
      state = { ...state, ...patch };
      const { stylesheet, defaults, document: current } = state;
      const images = state.images ?? new Map<string, string>();
      if (stylesheet === undefined || defaults === undefined || current === undefined) return;
      const meta = applyDefaults({ defaults }, current.meta);
      const template = templateOf(stylesheet, meta);
      const css = sheetCss(template);
      if (style.textContent !== css) style.textContent = css;
      const section = sectionOf(current, stylesheet);
      drawBand(elements.header, template.header, meta, section);
      drawBand(elements.footer, template.footer, meta, section);
      drawCover(elements.cover, template, meta, stylesheet, images);
      if (elements.titleBlock !== undefined) {
        drawTitleBlock(elements.titleBlock, template, meta, stylesheet, images);
      }
    },
  };
}
