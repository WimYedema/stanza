import {
  PAGE_SIZES,
  coverEntries,
  gridEntries,
  type CellRange,
  type CoverEntry,
  type CoverGrid,
  type DocumentMeta,
  type PageTemplate,
  type SlotPart,
  type Stylesheet,
} from '@stanza/core';
import { SCOPE_CLASS } from '@stanza/css';
import { drawCover, drawGrid, drawTitleBlock } from './sheet.js';
import { attachOverlay } from './styles-grid-overlay.js';
import type { CellAction, GridTarget } from './styles-grid.js';

/**
 * The preview of the cover and title block of a page template in the style editor (ADR 0091): the
 * cover on a sheet of its own, and the top of the first page with the title block, as the document
 * editor draws them (item 222), filled with sample metadata. A grid of the cover, header or footer
 * is drawn with its cells and areas, to edit it (ADR 0096).
 */

export interface CoverPreviewElements {
  /** Holds the sheets; hidden when the template has nothing to show. */
  readonly root: HTMLElement;
  readonly cover: HTMLElement;
  readonly first: HTMLElement;
  readonly titleBlock: HTMLElement;
  /** The header grid at the top of the first page, and a strip of the bottom with the footer grid. */
  readonly header?: HTMLElement;
  readonly foot?: HTMLElement;
  readonly footer?: HTMLElement;
  /** Where the actions for dragged cells are offered. */
  readonly bar?: HTMLElement;
}

const pt = (value: number): string => `${String(Math.round(value * 1000) / 1000)}pt`;

/** Where Word puts a header and a footer from the edge of the page without a distance: 1.25 cm. */
const BAND_DISTANCE_PT = 35.4;

/** The fields that the entries show, each with its name as its sample value. */
function fieldsOf(entries: readonly CoverEntry[]): Record<string, string> {
  const fields: Record<string, string> = {};
  const visit = (parts: readonly SlotPart[]): void => {
    for (const part of parts) if (part.kind === 'field') fields[part.name] = `‹${part.name}›`;
  };
  for (const entry of entries) {
    if (entry.kind === 'paragraph') visit(entry.text);
    if (entry.kind === 'table') for (const row of entry.rows) visit(row.value);
  }
  return fields;
}

/** Sample metadata for a template: the title, authors and classification, and the field names. */
export function sampleMeta(template: PageTemplate): DocumentMeta {
  const bands = [template.header?.grid, template.footer?.grid].flatMap((grid) =>
    grid === undefined ? [] : gridEntries(grid),
  );
  const entries = [
    ...(template.cover === undefined ? [] : coverEntries(template.cover)),
    ...(template.titleBlock ?? []),
    ...bands,
  ];
  return {
    title: 'Title of the document',
    authors: ['First Author', 'Second Author'],
    classification: 'Internal',
    fields: fieldsOf(entries),
  };
}

export interface GridHandlers {
  cells(target: GridTarget, range: CellRange, action: CellAction): void;
  select(target: GridTarget, name: string | undefined): void;
}

export interface CoverPreview {
  /** Draws the cover and title block of a template, or hides the preview for none. */
  show(template: PageTemplate | undefined, stylesheet: Stylesheet): void;
  setImages(images: ReadonlyMap<string, string>): void;
  /** Draws grids with their cells, and tells `handlers` what is done with them (ADR 0096). */
  setEditing(handlers: GridHandlers): void;
  /** Marks the selected area of a grid. */
  select(target: GridTarget, name: string | undefined): void;
}

export function createCoverPreview(elements: CoverPreviewElements): CoverPreview {
  const scoped = [elements.cover, elements.titleBlock, elements.header, elements.footer];
  for (const element of scoped) element?.classList.add(SCOPE_CLASS);
  let images: ReadonlyMap<string, string> = new Map();
  let last: { template: PageTemplate | undefined; stylesheet: Stylesheet } | undefined;
  let handlers: GridHandlers | undefined;
  const selected: Record<GridTarget, string | undefined> = {
    cover: undefined,
    header: undefined,
    footer: undefined,
  };

  /** Puts the cells of a grid over its drawing, while the grids are edited. */
  function overlay(root: HTMLElement, target: GridTarget, grid: CoverGrid): void {
    const layout = root.querySelector<HTMLElement>('.cover-grid');
    const { bar } = elements;
    if (layout === null || handlers === undefined || bar === undefined) return;
    const edit = handlers;
    attachOverlay(layout, grid, selected[target], bar, {
      cells: (range, action) => {
        edit.cells(target, range, action);
      },
      select: (name) => {
        selected[target] = name;
        edit.select(target, name);
      },
    });
  }

  /** A grid of a header or footer, at its distance from the edge, or nothing for slots. */
  function drawBandGrid(
    root: HTMLElement | undefined,
    target: 'header' | 'footer',
    template: PageTemplate,
    stylesheet: Stylesheet,
    meta: DocumentMeta,
  ): boolean {
    if (root === undefined) return false;
    root.replaceChildren();
    const spec = template[target];
    const grid = spec?.grid;
    const { widthPt } = PAGE_SIZES[template.size];
    const width = widthPt - template.margins.leftPt - template.margins.rightPt;
    const layout =
      grid === undefined
        ? undefined
        : drawGrid(grid, width, 0, meta, stylesheet, images, handlers !== undefined);
    root.hidden = layout === undefined;
    if (layout === undefined || grid === undefined) return false;
    const margin = target === 'header' ? template.margins.topPt : template.margins.bottomPt;
    const distance = spec?.distancePt ?? Math.min(BAND_DISTANCE_PT, margin / 2);
    root.style.position = 'absolute';
    root.style.left = pt(template.margins.leftPt);
    root.style.right = pt(template.margins.rightPt);
    root.style.setProperty(target === 'header' ? 'top' : 'bottom', pt(distance));
    root.append(layout);
    overlay(root, target, grid);
    return true;
  }

  function draw(): void {
    const template = last?.template;
    if (elements.bar !== undefined) {
      elements.bar.hidden = true;
      elements.bar.replaceChildren();
    }
    if (last === undefined || template === undefined) {
      elements.root.hidden = true;
      return;
    }
    const meta = sampleMeta(template);
    const { widthPt, heightPt } = PAGE_SIZES[template.size];
    const { margins } = template;
    for (const sheet of [elements.cover, elements.first, elements.foot]) {
      if (sheet === undefined) continue;
      sheet.style.width = pt(widthPt);
      sheet.style.boxSizing = 'border-box';
      sheet.style.position = 'relative';
    }
    elements.cover.style.minHeight = pt(heightPt);
    elements.first.style.padding = `${pt(margins.topPt)} ${pt(margins.rightPt)} 24pt ${pt(margins.leftPt)}`;
    const editing = handlers !== undefined;
    drawCover(elements.cover, template, meta, last.stylesheet, images, editing);
    // A cover of rows has its own margins; a list has those of the page.
    if (elements.cover.style.padding === '') {
      elements.cover.style.padding = [
        margins.topPt,
        margins.rightPt,
        margins.bottomPt,
        margins.leftPt,
      ]
        .map(pt)
        .join(' ');
    }
    if (template.cover?.kind === 'grid') overlay(elements.cover, 'cover', template.cover);
    drawTitleBlock(elements.titleBlock, template, meta, last.stylesheet, images);
    const header = drawBandGrid(elements.header, 'header', template, last.stylesheet, meta);
    const footer = drawBandGrid(elements.footer, 'footer', template, last.stylesheet, meta);
    if (elements.foot !== undefined) {
      elements.foot.hidden = !footer;
      elements.foot.style.height = pt(margins.bottomPt);
    }
    elements.first.hidden = elements.titleBlock.hidden && !header;
    elements.root.hidden = elements.cover.hidden && elements.first.hidden && !footer;
  }

  return {
    show(template, stylesheet) {
      last = { template, stylesheet };
      draw();
    },
    setImages(next) {
      images = next;
      draw();
    },
    setEditing(next) {
      handlers = next;
      draw();
    },
    select(target, name) {
      selected[target] = name;
      const root =
        target === 'cover'
          ? elements.cover
          : target === 'header'
            ? elements.header
            : elements.footer;
      for (const frame of root?.querySelectorAll<HTMLElement>('.grid-frame') ?? []) {
        frame.classList.toggle('selected', frame.dataset['area'] === name);
      }
    },
  };
}
