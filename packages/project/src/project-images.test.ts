import { describe, expect, it } from 'vitest';
import { memoryStorage } from './memory-storage.testing.js';
import { projectImages } from './project-images.js';

/** The start of a PNG of the given width: enough for its size to be read. */
function png(width: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, 1);
  return bytes;
}

describe('projectImages', () => {
  it('finds the PNG and JPEG files of a project, sorted, and leaves out what is not one', async () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xc0,
      0,
      17,
      8,
      0,
      2,
      0,
      3,
      ...new Array<number>(12).fill(0),
    ]);
    const storage = memoryStorage({ 'stanza.yaml': '', 'notes.png': 'not an image' }, [], {
      'assets/z.png': png(5),
      'assets/a.jpg': jpeg,
      'node_modules/x.png': png(1),
      '.hidden/y.png': png(1),
    });
    const images = await projectImages(storage);
    expect([...images.keys()]).toEqual(['assets/a.jpg', 'assets/z.png']);
    expect(images.get('assets/a.jpg')).toMatchObject({ format: 'jpeg', widthPx: 3, heightPx: 2 });
  });
});
