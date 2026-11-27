import { describe, expect, it } from 'vitest';
import { naturalWidthPt, readImageInfo } from './image-info.js';

/** The start of a PNG: the signature and the IHDR chunk with a width and a height. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG with an APP0 segment before its start-of-frame segment. */
function jpeg(width: number, height: number, marker = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0, 16, ...new Array<number>(14).fill(0)];
  const frame = [0xff, marker, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff];
  return new Uint8Array([0xff, 0xd8, ...app0, ...frame, ...new Array<number>(12).fill(0)]);
}

describe('readImageInfo', () => {
  it('reads the size of a PNG', () => {
    expect(readImageInfo(png(480, 160))).toEqual({ format: 'png', widthPx: 480, heightPx: 160 });
  });

  it('reads the size of a JPEG from its frame, past other segments', () => {
    expect(readImageInfo(jpeg(640, 300))).toEqual({ format: 'jpeg', widthPx: 640, heightPx: 300 });
    expect(readImageInfo(jpeg(10, 20, 0xc2))).toEqual({
      format: 'jpeg',
      widthPx: 10,
      heightPx: 20,
    });
  });

  it('knows nothing else, and nothing that is cut short or empty', () => {
    expect(readImageInfo(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x2f, 0x3e]))).toBeUndefined();
    expect(readImageInfo(png(480, 160).subarray(0, 20))).toBeUndefined();
    expect(readImageInfo(png(0, 160))).toBeUndefined();
    expect(readImageInfo(jpeg(640, 300).subarray(0, 24))).toBeUndefined();
    expect(readImageInfo(new Uint8Array())).toBeUndefined();
  });

  it('gives the natural width in points at 96 pixels per inch', () => {
    expect(naturalWidthPt({ format: 'png', widthPx: 96, heightPx: 1 })).toBe(72);
  });
});
