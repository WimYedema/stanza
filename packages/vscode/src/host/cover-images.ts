import type { ImageAsset } from '@stanza/core';

/**
 * The images of the covers and title blocks as data URLs, by path, for the sheet of the editor
 * (item 222). The webview reads no files: the project has read and checked them already.
 */
export function imageDataUrls(
  images: ReadonlyMap<string, ImageAsset>,
): Readonly<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const [path, image] of [...images].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const base64 = Buffer.from(image.bytes).toString('base64');
    urls[path] = `data:image/${image.format};base64,${base64}`;
  }
  return urls;
}
