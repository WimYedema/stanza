import {
  coverAreaHeightPt,
  coverAreaWidthPt,
  coverColumnWidthsPt,
  coverRowHeightsPt,
  isSafeRelativePath,
  PAGE_SIZES,
  naturalWidthPt,
  placeAreas,
  readImageInfo,
  type CoverGrid,
  type CoverImage,
  type ImageAsset,
  type PageTemplate,
  type Stylesheet,
} from '@stanza/core';
import type { ProjectDiagnostic } from './diagnostics.js';
import type { ProjectStorage } from './storage.js';

interface FoundImage {
  readonly entry: CoverImage;
  /** Where the entry is in the stylesheet. */
  readonly at: string;
  /** The width that the image has at most: of the cover page, or of the body text. */
  readonly maxWidthPt: number;
  /** The height of its row, or of the rows of its area, in points, when they have one. */
  readonly rowHeightPt: number | undefined;
  /** For the background of a cover (ADR 0097): the page it is stretched to, in points. */
  readonly page?: { readonly widthPt: number; readonly heightPt: number };
}

/** The key of the path in the stylesheet: of an image entry, or of a background image. */
const keyOf = (found: FoundImage): string =>
  found.page === undefined ? 'image' : 'background-image';

/** How far the proportions of a background image may differ from those of the page. */
const ASPECT_TOLERANCE = 0.02;

/** The width of the body text of a template, in points. */
const textWidthPt = (template: PageTemplate): number =>
  PAGE_SIZES[template.size].widthPt - template.margins.leftPt - template.margins.rightPt;

/**
 * Each image entry of the covers and title blocks of a stylesheet (ADR 0089, ADR 0090, ADR 0092),
 * with its place in the stylesheet.
 */
function imageEntries(stylesheet: Stylesheet): FoundImage[] {
  const found: FoundImage[] = [];
  for (const [name, template] of stylesheet.pageTemplates) {
    template.titleBlock?.forEach((entry, index) => {
      if (entry.kind !== 'image') return;
      found.push({
        entry,
        at: `page-templates.${name}.title-block[${String(index)}]`,
        maxWidthPt: textWidthPt(template),
        rowHeightPt: undefined,
      });
    });
    // The images of a header or a footer that is a grid (ADR 0095), as wide as the text at most.
    for (const part of ['header', 'footer'] as const) {
      const grid = template[part]?.grid;
      if (grid === undefined) continue;
      found.push(
        ...gridImages(
          grid,
          textWidthPt(template),
          coverRowHeightsPt(grid.rows, 0),
          `page-templates.${name}.${part}`,
        ),
      );
    }
    const cover = template.cover;
    if (cover === undefined) continue;
    const here = `page-templates.${name}.cover`;
    if (cover.kind !== 'list' && cover.backgroundImage !== undefined) {
      found.push({
        entry: { kind: 'image', path: cover.backgroundImage },
        at: here,
        maxWidthPt: PAGE_SIZES[template.size].widthPt,
        rowHeightPt: undefined,
        page: PAGE_SIZES[template.size],
      });
    }
    const maxWidthPt = coverAreaWidthPt(template);
    if (cover.kind === 'list') {
      cover.entries.forEach((entry, index) => {
        if (entry.kind !== 'image') return;
        found.push({ entry, at: `${here}[${String(index)}]`, maxWidthPt, rowHeightPt: undefined });
      });
      continue;
    }
    if (cover.kind === 'rows') {
      const heights = coverRowHeightsPt(
        cover.rows.map((row) => row.height),
        coverAreaHeightPt(template),
      );
      cover.rows.forEach((row, rowIndex) => {
        row.content.forEach((entry, index) => {
          if (entry.kind !== 'image') return;
          found.push({
            entry,
            at: `${here}.rows[${String(rowIndex)}].content[${String(index)}]`,
            maxWidthPt,
            rowHeightPt: heights[rowIndex],
          });
        });
      });
      continue;
    }
    found.push(
      ...gridImages(
        cover,
        maxWidthPt,
        coverRowHeightsPt(cover.rows, coverAreaHeightPt(template)),
        here,
      ),
    );
  }
  return found;
}

/** The images of a grid: each has the width of its area, and the height of the rows it spans. */
function gridImages(
  grid: CoverGrid,
  widthPt: number,
  heights: readonly (number | undefined)[],
  here: string,
): FoundImage[] {
  const found: FoundImage[] = [];
  const widths = coverColumnWidthsPt(grid.columns, widthPt);
  for (const placed of placeAreas(grid.areas, grid.columns.length).areas) {
    const spanned = heights.slice(placed.row, placed.row + placed.rowSpan);
    const areaHeight = spanned.every((height) => height !== undefined)
      ? spanned.reduce<number>((sum, height) => sum + height, 0)
      : undefined;
    const areaWidth = widths
      .slice(placed.column, placed.column + placed.columnSpan)
      .reduce((sum, width) => sum + width, 0);
    grid.area[placed.name]?.content.forEach((entry, index) => {
      if (entry.kind !== 'image') return;
      found.push({
        entry,
        at: `${here}.area.${placed.name}.content[${String(index)}]`,
        maxWidthPt: areaWidth,
        rowHeightPt: areaHeight,
      });
    });
  }
  return found;
}

/** Warnings for an image that does not fit where the template puts it (ADR 0089). */
function checkFit(
  found: FoundImage,
  image: ImageAsset,
  file: string,
  diagnostics: ProjectDiagnostic[],
): void {
  if (found.page !== undefined) {
    // A background is stretched to the page, so only its proportions matter (ADR 0097).
    const page = found.page.widthPt / found.page.heightPt;
    const own = image.widthPx / image.heightPx;
    if (Math.abs(own / page - 1) > ASPECT_TOLERANCE) {
      diagnostics.push({
        file,
        severity: 'warning',
        code: 'image-aspect',
        message: `The background image is ${String(image.widthPx)} by ${String(image.heightPx)} pixels, which does not have the proportions of the page, so it is stretched; make it ${String(Math.round(image.heightPx * page))} pixels wide for this height.`,
        path: `${found.at}.background-image`,
      });
    }
    return;
  }
  const { maxWidthPt } = found;
  const askedPt = found.entry.widthPt ?? naturalWidthPt(image);
  const widthPt = Math.min(askedPt, maxWidthPt);
  if (askedPt > maxWidthPt) {
    diagnostics.push({
      file,
      severity: 'warning',
      code: 'image-too-wide',
      message: `The image is ${String(Math.round(askedPt))} pt wide, wider than the ${String(Math.floor(maxWidthPt))} pt it has, and is made that wide.`,
      path: `${found.at}.${found.entry.widthPt === undefined ? 'image' : 'width'}`,
    });
  }
  const heightPt = (widthPt * image.heightPx) / image.widthPx;
  if (found.rowHeightPt !== undefined && heightPt > found.rowHeightPt) {
    diagnostics.push({
      file,
      severity: 'warning',
      code: 'image-too-tall',
      message: `The image is ${String(Math.round(heightPt))} pt high, higher than its row of ${String(Math.floor(found.rowHeightPt))} pt, and Word cuts it off.`,
      path: `${found.at}.image`,
    });
  }
}

/**
 * Reads the images that the covers and title blocks of the stylesheet show (ADR 0089, ADR 0090), by path, and checks that
 * they fit. An image that is missing, or that is not a PNG or JPEG, is reported once, at its first
 * entry. A path that is not safe is left to the stylesheet check.
 */
export async function loadCoverImages(
  storage: ProjectStorage,
  stylesheet: Stylesheet,
  stylesheetFile: string,
  diagnostics: ProjectDiagnostic[],
): Promise<ReadonlyMap<string, ImageAsset>> {
  const images = new Map<string, ImageAsset>();
  const tried = new Set<string>();
  const found = imageEntries(stylesheet);
  for (const one of found) {
    const { entry, at } = one;
    const key = keyOf(one);
    if (tried.has(entry.path) || !isSafeRelativePath(entry.path)) continue;
    tried.add(entry.path);
    let bytes: Uint8Array;
    try {
      bytes = await storage.readBytes(entry.path);
    } catch {
      diagnostics.push({
        file: stylesheetFile,
        severity: 'error',
        code: 'image-not-found',
        message: `The image "${entry.path}" was not found in the project.`,
        path: `${at}.${key}`,
      });
      continue;
    }
    const info = readImageInfo(bytes);
    if (info === undefined) {
      diagnostics.push({
        file: stylesheetFile,
        severity: 'error',
        code: 'image-unsupported',
        message: `The image "${entry.path}" is not a PNG or JPEG file.`,
        path: `${at}.${key}`,
      });
      continue;
    }
    images.set(entry.path, { ...info, bytes });
  }
  for (const entry of found) {
    const image = images.get(entry.entry.path);
    if (image !== undefined) checkFit(entry, image, stylesheetFile, diagnostics);
  }
  return images;
}
