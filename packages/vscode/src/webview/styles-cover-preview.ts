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
import { drawBand, drawCover, drawTitleBlock } from './sheet.js';
import { GRID_HINT, attachOverlay } from './styles-grid-overlay.js';
import { drawMeasure, type Measure } from './styles-measure.js';
import type { CellAction, GridTarget } from './styles-grid.js';

/**
 * The preview of the cover and title block of a page template in the style editor (ADR 0091): the
 * cover on a sheet of its own, and the top of the first page with the title block, as the document
 * editor draws them (item 222), filled with sample metadata. A grid of the cover, header or footer
 * is drawn with its cells and areas, to edit it. While a part of the layout is edited, only that
 * part is shown: the cover page, or a body page with its header and footer (ADR 0096).
 */

export interface CoverPreviewElements {
  /** Holds the sheets; hidden when the template has nothing to show. */
  readonly root: HTMLElement;
  readonly cover: HTMLElement;
  readonly first: HTMLElement;
  readonly titleBlock: HTMLElement;
  /** The header and the footer, on the first page at their distances from the edges. */
  readonly header?: HTMLElement;
  readonly footer?: HTMLElement;
  /** Where the actions for dragged cells are offered. */
  readonly bar?: HTMLElement;
}

const el = (tag: string, className: string, text: string): HTMLElement => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};

const pt = (value: number): string => `${String(Math.round(value * 1000) / 1000)}pt`;

/** Where Word puts a header and a footer from the edge of the page without a distance: 1.25 cm. */
const BAND_DISTANCE_PT = 35.4;

/** What the section field shows in a sample header or footer. */
const SAMPLE_SECTION = '1 Introduction';

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
  /**
   * Draws the cover and title block of a template, or hides the preview for none; with a part, only
   * the cover page or only a body page.
   */
  show(template: PageTemplate | undefined, stylesheet: Stylesheet, part?: 'cover' | 'body'): void;
  setImages(images: ReadonlyMap<string, string>): void;
  /** Draws grids with their cells, and tells `handlers` what is done with them (ADR 0096). */
  setEditing(handlers: GridHandlers): void;
  /** Marks the selected area of a grid. */
  select(target: GridTarget, name: string | undefined): void;
  /** Shows with an arrow what the field with the cursor sizes, or nothing. */
  measure(measure: Measure | undefined): void;
}

export function createCoverPreview(elements: CoverPreviewElements): CoverPreview {
  const scoped = [elements.cover, elements.titleBlock, elements.header, elements.footer];
  for (const element of scoped) element?.classList.add(SCOPE_CLASS);
  let images: ReadonlyMap<string, string> = new Map();
  let last:
    | { template: PageTemplate | undefined; stylesheet: Stylesheet; part?: 'cover' | 'body' }
    | undefined;
  let handlers: GridHandlers | undefined;
  let measured: Measure | undefined;
  const sheets = () => ({
    cover: elements.cover,
    body: elements.first,
    ...(elements.header !== undefined ? { header: elements.header } : {}),
    ...(elements.footer !== undefined ? { footer: elements.footer } : {}),
  });
  const selected: Record<GridTarget, string | undefined> = {
    cover: undefined,
    header: undefined,
    footer: undefined,
  };

  /** What the bar says while a grid is shown and no cells are selected. */
  function showHint(): void {
    const { bar } = elements;
    if (bar === undefined) return;
    const grids = (
      elements.root.hidden ? [] : [...elements.root.querySelectorAll('.cover-grid.editing')]
    ).filter((grid) => grid.closest('[hidden]') === null);
    bar.hidden = grids.length === 0;
    if (bar.childElementCount === 0) {
      bar.append(el('span', 'hint', GRID_HINT));
    }
  }

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

  /** A header or footer, its slots or its grid, at its distance from the edge of the page. */
  function drawBandOf(
    root: HTMLElement | undefined,
    target: 'header' | 'footer',
    template: PageTemplate,
    stylesheet: Stylesheet,
    meta: DocumentMeta,
  ): void {
    if (root === undefined) return;
    const spec = template[target];
    const { widthPt } = PAGE_SIZES[template.size];
    const { margins } = template;
    drawBand(root, spec, meta, SAMPLE_SECTION, {
      widthPt: widthPt - margins.leftPt - margins.rightPt,
      stylesheet,
      images,
      editing: handlers !== undefined,
    });
    if (root.hidden) return;
    const margin = target === 'header' ? margins.topPt : margins.bottomPt;
    const distance = spec?.distancePt ?? Math.min(BAND_DISTANCE_PT, margin / 2);
    root.style.position = 'absolute';
    root.style.left = pt(margins.leftPt);
    root.style.right = pt(margins.rightPt);
    root.style.setProperty(target === 'header' ? 'top' : 'bottom', pt(distance));
    if (spec?.grid !== undefined) overlay(root, target, spec.grid);
  }

  function draw(): void {
    const template = last?.template;
    if (elements.bar !== undefined) elements.bar.replaceChildren();
    if (last === undefined || template === undefined) {
      elements.root.hidden = true;
      return;
    }
    const meta = sampleMeta(template);
    const { part } = last;
    const { widthPt, heightPt } = PAGE_SIZES[template.size];
    const { margins } = template;
    for (const sheet of [elements.cover, elements.first]) {
      sheet.style.width = pt(widthPt);
      sheet.style.boxSizing = 'border-box';
      sheet.style.position = 'relative';
    }
    elements.cover.style.minHeight = pt(heightPt);
    // A body page is shown whole while it is edited; else only its top, with the title block.
    elements.first.style.minHeight = part === 'body' ? pt(heightPt) : '';
    elements.first.style.padding = `${pt(margins.topPt)} ${pt(margins.rightPt)} ${part === 'body' ? pt(margins.bottomPt) : '24pt'} ${pt(margins.leftPt)}`;
    drawCover(elements.cover, template, meta, last.stylesheet, images, handlers !== undefined);
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
    const bands = part === 'body';
    if (bands) {
      drawBandOf(elements.header, 'header', template, last.stylesheet, meta);
      drawBandOf(elements.footer, 'footer', template, last.stylesheet, meta);
    } else {
      for (const band of [elements.header, elements.footer]) {
        if (band !== undefined) band.hidden = true;
      }
    }
    if (part === 'cover') elements.first.hidden = true;
    else elements.first.hidden = !bands && elements.titleBlock.hidden;
    if (part === 'body') elements.cover.hidden = true;
    elements.root.hidden = elements.cover.hidden && elements.first.hidden;
    showHint();
    drawMeasure(sheets(), measured);
  }

  return {
    show(template, stylesheet, part) {
      last = { template, stylesheet, ...(part !== undefined ? { part } : {}) };
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
    measure(next) {
      measured = next;
      drawMeasure(sheets(), measured);
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
