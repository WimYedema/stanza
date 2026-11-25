/** The image formats a document can hold (ADR 0089). */
export type ImageFormat = 'png' | 'jpeg';

/** What the exporter needs to know about an image file. */
export interface ImageInfo {
  readonly format: ImageFormat;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** An image file with what was read from it. */
export interface ImageAsset extends ImageInfo {
  readonly bytes: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const uint32 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] ?? 0) * 0x1000000 +
    ((bytes[at + 1] ?? 0) << 16) +
    ((bytes[at + 2] ?? 0) << 8) +
    (bytes[at + 3] ?? 0)) >>>
  0;

const uint16 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] ?? 0) << 8) + (bytes[at + 1] ?? 0);

function pngInfo(bytes: Uint8Array): ImageInfo | undefined {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return undefined;
  }
  // The first chunk is IHDR: its length, its type, then the width and the height.
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (type !== 'IHDR') return undefined;
  const widthPx = uint32(bytes, 16);
  const heightPx = uint32(bytes, 20);
  return widthPx > 0 && heightPx > 0 ? { format: 'png', widthPx, heightPx } : undefined;
}

/** Start-of-frame markers, which hold the size; not DHT (C4), JPG (C8) or DAC (CC). */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegInfo(bytes: Uint8Array): ImageInfo | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] ?? 0;
    // Fill bytes, and markers without a length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return undefined;
    const length = uint16(bytes, at + 2);
    if (length < 2) return undefined;
    if (isStartOfFrame(marker)) {
      if (at + 9 > bytes.length) return undefined;
      const heightPx = uint16(bytes, at + 5);
      const widthPx = uint16(bytes, at + 7);
      return widthPx > 0 && heightPx > 0 ? { format: 'jpeg', widthPx, heightPx } : undefined;
    }
    at += 2 + length;
  }
  return undefined;
}

/** The format and size of a PNG or JPEG, read from its content; undefined for anything else. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | undefined {
  return pngInfo(bytes) ?? jpegInfo(bytes);
}

/** The size of an image in points, at 96 pixels per inch. */
export const naturalWidthPt = (image: ImageInfo): number => (image.widthPx * 72) / 96;
