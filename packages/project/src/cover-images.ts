import {
  coverAreaHeightPt,
  coverAreaWidthPt,
  coverRowHeightsPt,
  isSafeRelativePath,
  PAGE_SIZES,
  naturalWidthPt,
  readImageInfo,
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
  /** The height of its row in points, when the row has one. */
  readonly rowHeightPt: number | undefined;
}

/** The width of the body text of a template, in points. */
const textWidthPt = (template: PageTemplate): number =>
  PAGE_SIZES[template.size].widthPt - template.margins.leftPt - template.margins.rightPt;

/**
 * Each image entry of the covers and title blocks of a stylesheet (ADR 0089, ADR 0090), with its
 * place in the stylesheet.
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
    const cover = template.cover;
    if (cover === undefined) continue;
    const here = `page-templates.${name}.cover`;
    const maxWidthPt = coverAreaWidthPt(template);
    if (cover.kind === 'list') {
      cover.entries.forEach((entry, index) => {
        if (entry.kind !== 'image') return;
        found.push({ entry, at: `${here}[${String(index)}]`, maxWidthPt, rowHeightPt: undefined });
      });
      continue;
    }
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
  for (const { entry, at } of found) {
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
        path: `${at}.image`,
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
        path: `${at}.image`,
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
