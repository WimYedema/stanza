import { describe, expect, it } from 'vitest';
import { imageDataUrls } from './cover-images.js';

describe('imageDataUrls', () => {
  it('makes a data URL of each image, by path in order, with the type of its format', () => {
    const urls = imageDataUrls(
      new Map([
        [
          'b/mark.jpg',
          { format: 'jpeg' as const, widthPx: 1, heightPx: 1, bytes: new Uint8Array([255, 216]) },
        ],
        [
          'a/logo.png',
          { format: 'png' as const, widthPx: 1, heightPx: 1, bytes: new Uint8Array([137, 80]) },
        ],
      ]),
    );
    expect(Object.entries(urls)).toEqual([
      ['a/logo.png', 'data:image/png;base64,iVA='],
      ['b/mark.jpg', 'data:image/jpeg;base64,/9g='],
    ]);
  });

  it('is empty without images', () => {
    expect(imageDataUrls(new Map())).toEqual({});
  });
});
