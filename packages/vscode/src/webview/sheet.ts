import {
  BODY_STYLE,
  BUILT_IN_PAGE_TEMPLATE,
  PAGE_SIZES,
  PAGE_TEMPLATE_FIELD,
  RESERVED_TABLE_STYLE,
  applyDefaults,
  coverBlocks,
  numberHeadings,
  resolvePageTemplate,
  resolveTableStyle,
  slotValue,
  type Block,
  type Document,
  type DocumentMeta,
  type HeaderFooter,
  type PageTemplate,
  type ProjectDefaults,
  type SlotPart,
  type Stylesheet,
} from '@phrase/core';
import { paragraphClass, tableClass } from '@phrase/css';

/**
 * The paper look of the editor (ADR 0028): the page of the selected template around the text, with
 * its header and footer in the margins, and the cover as a sheet of its own. It is a view of the
 * template and the metadata. Nothing here is part of the document, and there is no pagination.
 */

/** Where Word puts a header and a footer from the edge of the page: 1.25 cm (ADR 0016). */
const BAND_DISTANCE_PT = 35.4;

/** The class that the CSS of the stylesheet is scoped to, so that its rules reach the parts here. */
const SCOPE = 'phrase-document';

export interface SheetInput {
  readonly stylesheet: Stylesheet;
  readonly defaults: ProjectDefaults;
  readonly document: Document;
}

export interface SheetElements {
  readonly cover: HTMLElement;
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

/** The cover as paragraphs and tables with the classes of their styles, as the editor writes them. */
function drawCover(root: HTMLElement, blocks: readonly Block[], stylesheet: Stylesheet): void {
  root.replaceChildren();
  root.hidden = blocks.length === 0;
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const paragraph = document.createElement('p');
      paragraph.className = paragraphClass(block.style ?? BODY_STYLE);
      paragraph.textContent = textOf(block);
      root.append(paragraph);
    } else if (block.type === 'table') {
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
          td.textContent = cell.content.map((inline) => inline.text).join('');
        }
      }
      root.append(table);
    }
  }
}

export function createSheet(elements: SheetElements): Sheet {
  const style = document.createElement('style');
  if (elements.nonce !== undefined) style.setAttribute('nonce', elements.nonce);
  document.head.append(style);
  for (const root of [elements.cover, elements.header, elements.footer]) root.classList.add(SCOPE);

  let state: Partial<SheetInput> = {};
  return {
    update(patch) {
      state = { ...state, ...patch };
      const { stylesheet, defaults, document: current } = state;
      if (stylesheet === undefined || defaults === undefined || current === undefined) return;
      const meta = applyDefaults({ defaults }, current.meta);
      const template = templateOf(stylesheet, meta);
      const css = sheetCss(template);
      if (style.textContent !== css) style.textContent = css;
      const section = sectionOf(current, stylesheet);
      drawBand(elements.header, template.header, meta, section);
      drawBand(elements.footer, template.footer, meta, section);
      drawCover(elements.cover, coverBlocks(template.cover ?? [], meta), stylesheet);
    },
  };
}
