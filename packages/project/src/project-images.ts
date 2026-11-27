import { readImageInfo, type ImageAsset } from '@stanza/core';
import { findDocuments } from './files.js';
import type { ProjectStorage } from './storage.js';

/** At most this many images, and this many bytes of them, so that a project of photos stays usable. */
export const MAX_PROJECT_IMAGES = 100;
export const MAX_PROJECT_IMAGE_BYTES = 10_000_000;

/**
 * The PNG and JPEG files of a project by path, sorted, for choosing an image in the style editor
 * (ADR 0091). A file that cannot be read or is not what its name says is left out, and so are the
 * files beyond the limits.
 */
export async function projectImages(storage: ProjectStorage): Promise<Map<string, ImageAsset>> {
  const paths = (
    await Promise.all(['.png', '.jpg', '.jpeg'].map((suffix) => findDocuments(storage, suffix)))
  )
    .flat()
    .sort();
  const images = new Map<string, ImageAsset>();
  let total = 0;
  for (const path of paths) {
    if (images.size >= MAX_PROJECT_IMAGES) break;
    let bytes: Uint8Array;
    try {
      bytes = await storage.readBytes(path);
    } catch {
      continue;
    }
    const info = readImageInfo(bytes);
    if (info === undefined || total + bytes.length > MAX_PROJECT_IMAGE_BYTES) continue;
    total += bytes.length;
    images.set(path, { ...info, bytes });
  }
  return images;
}
