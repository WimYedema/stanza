import { unzipSync } from 'fflate';
import { type HeaderFooter, type PageMargins, type PageSize } from '@stanza/core';
import { childOf, elementsOf } from './xml.js';
import { type CoverTemplateOptions, type CoverTemplateResult } from './cover-template/types.js';
import {
  MAX_PART_BYTES,
  type Part,
  RELATIONSHIP_BASE,
  descendants,
  twipsToPt,
} from './cover-template/shared.js';
import { TemplatePackage } from './cover-template/package.js';
import { Looks, readTheme } from './cover-template/looks.js';
import { Reader } from './cover-template/reader.js';
import { GridBuilder, type Piece, groupByFrame } from './cover-template/grid.js';

export type * from './cover-template/types.js';

/**
 * The import of the cover of a Word template (ADR 0094): the first page, with the first-page header
 * and footer, as a cover grid with styles, tokens and images for the stylesheet of a project. Word
 * does not store where a paragraph lands, so heights are estimated from the styles.
 */

const PAGE_SIZES_TWIPS: readonly [PageSize, number, number][] = [
  ['A4', 11906, 16838],
  ['Letter', 12240, 15840],
];

/** Reads a Word template and makes the cover of its first page (ADR 0094). */
export function importCoverTemplate(
  bytes: Uint8Array,
  options: CoverTemplateOptions,
): CoverTemplateResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.originalSize <= MAX_PART_BYTES });
  } catch {
    return {
      ok: false,
      message: 'This is not a Word file: it is not a ZIP package, or it is damaged.',
    };
  }
  const pkg = new TemplatePackage(files);
  const documentPath = files['word/document.xml'] !== undefined ? 'word/document.xml' : undefined;
  const document = documentPath === undefined ? undefined : pkg.part(documentPath);
  const body = childOf(document?.xml, 'body');
  if (document === undefined || body === undefined) {
    return { ok: false, message: 'This file has no Word document in it.' };
  }
  const partOfType = (type: string): Part | undefined => {
    const entry = [...document.relationships.values()].find(
      (r) => r.type === `${RELATIONSHIP_BASE}${type}`,
    );
    return entry === undefined ? undefined : pkg.part(entry.path);
  };
  const theme = readTheme(partOfType('theme')?.xml);
  const looks = new Looks(partOfType('styles')?.xml, theme);
  const reader = new Reader(looks);
  const converted: string[] = [];
  const { name } = options;

  // The section of the first page: the first section break, or the one at the end of the body.
  const sectionBreak = descendants(body, 'pPr')
    .map((pPr) => childOf(pPr, 'sectPr'))
    .find((s) => s !== undefined);
  const section = sectionBreak ?? childOf(body, 'sectPr');
  const pageSize = childOf(section, 'pgSz');
  const margin = childOf(section, 'pgMar');
  const width = Number(pageSize?.attrs['w'] ?? '11906');
  const height = Number(pageSize?.attrs['h'] ?? '16838');
  const [size] = [...PAGE_SIZES_TWIPS].sort(
    (a, b) =>
      Math.abs(a[1] - width) +
      Math.abs(a[2] - height) -
      (Math.abs(b[1] - width) + Math.abs(b[2] - height)),
  )[0] ?? ['A4'];
  const sizeTwips = PAGE_SIZES_TWIPS.find(([candidate]) => candidate === size);
  if (
    sizeTwips !== undefined &&
    (Math.abs(sizeTwips[1] - width) > 240 || Math.abs(sizeTwips[2] - height) > 240)
  ) {
    reader.approximated.push(
      `The page of ${String(width / 20)} by ${String(height / 20)} pt is made ${size}.`,
    );
  }
  const margins: PageMargins = {
    topPt: twipsToPt(margin?.attrs['top']) ?? 72,
    rightPt: twipsToPt(margin?.attrs['right']) ?? 72,
    bottomPt: twipsToPt(margin?.attrs['bottom']) ?? 72,
    leftPt: twipsToPt(margin?.attrs['left']) ?? 72,
  };
  const headerDistance = twipsToPt(margin?.attrs['header']) ?? 35.4;
  const footerDistance = twipsToPt(margin?.attrs['footer']) ?? 35.4;
  converted.push(
    `The page: ${size}, margins ${[margins.topPt, margins.rightPt, margins.bottomPt, margins.leftPt].join(', ')} pt.`,
  );

  // The header and the footer of the first page.
  const firstPageOnly = childOf(section, 'titlePg') !== undefined;
  const referenced = (kind: 'header' | 'footer'): Part | undefined => {
    const references = elementsOf(section, `${kind}Reference`);
    const reference =
      references.find((r) => r.attrs['type'] === (firstPageOnly ? 'first' : 'default')) ??
      (firstPageOnly ? undefined : references[0]);
    const id = reference?.attrs['id'];
    const target = id === undefined ? undefined : document.relationships.get(id);
    return target === undefined ? undefined : pkg.part(target.path);
  };
  const header = referenced('header');
  const footer = referenced('footer');
  // Shapes anchored to the first page are placed on it, not in the flow (ADR 0098).
  const page = {
    widthPt: width / 20,
    heightPt: height / 20,
    ...margins,
  };
  reader.shapes = { page, found: [] };
  const headerBlocks = header === undefined ? [] : reader.blocks(header.xml, header, false);
  const bodyBlocks = reader.blocks(body, document, true);
  const footerBlocks = footer === undefined ? [] : reader.blocks(footer.xml, footer, false);
  const shapes = reader.shapes.found;
  reader.shapes = undefined;
  if (header !== undefined)
    converted.push('The header of the first page, at the top of the cover.');
  if (footer !== undefined)
    converted.push('The footer of the first page, at the bottom of the cover.');

  const coverWidthPt = width / 20 - margins.leftPt - margins.rightPt;
  const pageHeight = height / 20;
  const build = new GridBuilder(name, coverWidthPt, looks, reader, options, pkg);
  // Each part of the page with where its top is, in points from the top of the page.
  const pieces: Piece[] = [];
  if (header !== undefined) pieces.push({ top: headerDistance, ...build.capture(headerBlocks) });
  let flow = Math.max(margins.topPt, (pieces[0]?.top ?? 0) + (pieces[0]?.height ?? 0));
  for (const group of groupByFrame(bodyBlocks)) {
    const captured = build.capture(group.blocks);
    const frame = group.frame;
    if (frame === undefined) {
      pieces.push({ top: flow, ...captured });
      flow += captured.height;
      continue;
    }
    const [from, to] =
      frame.anchor === 'page' ? [0, pageHeight] : [margins.topPt, pageHeight - margins.bottomPt];
    const top =
      frame.y !== undefined
        ? (frame.anchor === 'text' ? flow : from) + frame.y
        : frame.align === 'bottom' || frame.align === 'outside'
          ? to - captured.height
          : frame.align === 'center'
            ? from + (to - from - captured.height) / 2
            : from;
    pieces.push({ top, ...captured });
    converted.push('A frame at its place on the page.');
  }
  const footerPiece = footer === undefined ? undefined : build.capture(footerBlocks);

  // The header and footer of the body pages (ADR 0095): the default ones, as grids.
  const bodyBand = (kind: 'header' | 'footer', distancePt: number): HeaderFooter | undefined => {
    const references = elementsOf(section, `${kind}Reference`);
    if (references.some((r) => r.attrs['type'] === 'even')) {
      reader.leftOut.push(`The ${kind} of even pages is left out; the body has one ${kind}.`);
    }
    const id = references.find((r) => r.attrs['type'] === 'default')?.attrs['id'];
    const target = id === undefined ? undefined : document.relationships.get(id);
    const part = target === undefined ? undefined : pkg.part(target.path);
    if (part === undefined) return undefined;
    reader.band = true;
    const grid = build.band(reader.blocks(part.xml, part, false));
    reader.band = false;
    if (grid === undefined) return undefined;
    converted.push(
      `The ${kind} of the body pages, as a grid at ${String(distancePt)} pt from the edge.`,
    );
    return { left: [], center: [], right: [], distancePt, grid };
  };
  const bodyHeader = bodyBand('header', headerDistance);
  const bodyFooter = bodyBand('footer', footerDistance);
  build.place(pieces, header === undefined ? margins.topPt : headerDistance, footerPiece);

  const coverMargins: Partial<PageMargins> = {
    topPt: header === undefined ? margins.topPt : headerDistance,
    bottomPt: footer === undefined ? margins.bottomPt : footerDistance,
  };
  const cover =
    shapes.length > 0
      ? build.shapedGrid(shapes, page, coverMargins.topPt ?? 0, coverMargins.bottomPt ?? 0)
      : build.grid(
          coverMargins,
          height / 20 - (coverMargins.topPt ?? 0) - (coverMargins.bottomPt ?? 0),
        );
  converted.push(
    `The cover: ${String(cover.columns.length)} columns and ${String(cover.rows.length)} rows, with heights estimated from the styles.`,
  );
  return {
    ok: true,
    result: {
      name,
      size,
      margins,
      cover,
      ...(bodyHeader !== undefined ? { header: bodyHeader } : {}),
      ...(bodyFooter !== undefined ? { footer: bodyFooter } : {}),
      paragraphStyles: build.paragraphStyles(),
      tableStyles: build.tableStyles,
      colors: build.newColors,
      fonts: build.newFonts,
      images: build.images,
      fields: [...reader.fields].sort(),
      converted: [...converted, ...build.converted, ...new Set(reader.converted)],
      approximated: [...new Set(reader.approximated)],
      leftOut: [...new Set(reader.leftOut)],
    },
  };
}
