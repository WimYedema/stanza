import {
  PAGE_SIZES,
  coverEntries,
  type CoverEntry,
  type DocumentMeta,
  type PageTemplate,
  type SlotPart,
  type Stylesheet,
} from '@stanza/core';
import { SCOPE_CLASS } from '@stanza/css';
import { drawCover, drawTitleBlock } from './sheet.js';

/**
 * The preview of the cover and title block of a page template in the style editor (ADR 0091): the
 * cover on a sheet of its own, and the top of the first page with the title block, as the document
 * editor draws them (item 222), filled with sample metadata.
 */

export interface CoverPreviewElements {
  /** Holds the two sheets; hidden when the template has neither a cover nor a title block. */
  readonly root: HTMLElement;
  readonly cover: HTMLElement;
  readonly first: HTMLElement;
  readonly titleBlock: HTMLElement;
}

const pt = (value: number): string => `${String(Math.round(value * 1000) / 1000)}pt`;

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
  const entries = [
    ...(template.cover === undefined ? [] : coverEntries(template.cover)),
    ...(template.titleBlock ?? []),
  ];
  return {
    title: 'Title of the document',
    authors: ['First Author', 'Second Author'],
    classification: 'Internal',
    fields: fieldsOf(entries),
  };
}

export interface CoverPreview {
  /** Draws the cover and title block of a template, or hides the preview for none. */
  show(template: PageTemplate | undefined, stylesheet: Stylesheet): void;
  setImages(images: ReadonlyMap<string, string>): void;
}

export function createCoverPreview(elements: CoverPreviewElements): CoverPreview {
  for (const element of [elements.cover, elements.titleBlock]) element.classList.add(SCOPE_CLASS);
  let images: ReadonlyMap<string, string> = new Map();
  let last: { template: PageTemplate | undefined; stylesheet: Stylesheet } | undefined;

  function draw(): void {
    const template = last?.template;
    if (last === undefined || template === undefined) {
      elements.root.hidden = true;
      return;
    }
    const meta = sampleMeta(template);
    const { widthPt, heightPt } = PAGE_SIZES[template.size];
    const { margins } = template;
    for (const sheet of [elements.cover, elements.first]) {
      sheet.style.width = pt(widthPt);
      sheet.style.boxSizing = 'border-box';
    }
    elements.cover.style.minHeight = pt(heightPt);
    elements.first.style.padding = `${pt(margins.topPt)} ${pt(margins.rightPt)} 24pt ${pt(margins.leftPt)}`;
    drawCover(elements.cover, template, meta, last.stylesheet, images);
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
    drawTitleBlock(elements.titleBlock, template, meta, last.stylesheet, images);
    elements.first.hidden = elements.titleBlock.hidden;
    elements.root.hidden = elements.cover.hidden && elements.first.hidden;
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
  };
}
