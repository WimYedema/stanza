import { describe, expect, it } from 'vitest';
import { findProjectRoot } from './project-root.js';

/** Folders as paths like `/w/a/b`, with a project file in some of them. */
const parent = (folder: string): string | undefined => {
  const cut = folder.lastIndexOf('/');
  return cut <= 0 ? undefined : folder.slice(0, cut);
};

const find = (start: string, withFile: string[], top: string): Promise<string | undefined> =>
  findProjectRoot(
    start,
    parent,
    (folder) => Promise.resolve(withFile.includes(folder)),
    (folder) => folder === top,
  );

describe('findProjectRoot', () => {
  it('is the folder of the document when it has the project file', async () => {
    expect(await find('/w/p', ['/w/p'], '/w')).toBe('/w/p');
  });

  it('is the nearest folder above that has one', async () => {
    expect(await find('/w/p/documents/deep', ['/w/p', '/w'], '/w')).toBe('/w/p');
  });

  it('does not go above the workspace folder', async () => {
    expect(await find('/w/p/documents', ['/'], '/w/p')).toBeUndefined();
    expect(await find('/w/p/documents', ['/w'], '/w/p')).toBeUndefined();
  });

  it('is undefined when there is no project file, also at the top of the file system', async () => {
    expect(await find('/w/p', [], '/never')).toBeUndefined();
  });
});
