import { describe, expect, it } from 'vitest';
import { projectStorage, type FileIo } from './storage.js';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

function io(
  files: Record<string, string>,
  open: Record<string, string> = {},
): FileIo & {
  readonly written: Map<string, string>;
} {
  const written = new Map<string, string>();
  return {
    written,
    read: (path) => {
      const text = files[path];
      return text === undefined
        ? Promise.reject(new Error(`No ${path}`))
        : Promise.resolve(bytes(text));
    },
    list: () => Promise.resolve([{ name: 'a.stanza.md', directory: false }]),
    write: (path, content) => {
      written.set(path, new TextDecoder().decode(content));
      return Promise.resolve();
    },
    openText: (path) => open[path],
  };
}

describe('projectStorage', () => {
  it('reads a file as UTF-8 text', async () => {
    const storage = projectStorage(io({ 'a.md': 'Zoë\n' }));
    expect(await storage.readText('a.md')).toBe('Zoë\n');
  });

  it('prefers the text of an open document, which may have changes that are not saved', async () => {
    const storage = projectStorage(io({ 'a.md': 'on disk' }, { 'a.md': 'in the editor' }));
    expect(await storage.readText('a.md')).toBe('in the editor');
  });

  it('rejects for a file that cannot be read', async () => {
    await expect(projectStorage(io({})).readText('missing.md')).rejects.toThrow('No missing.md');
  });

  it('lists and writes through the file system', async () => {
    const files = io({});
    const storage = projectStorage(files);
    expect(await storage.list('')).toEqual([{ name: 'a.stanza.md', directory: false }]);
    await storage.writeText('out/a.txt', 'text');
    await storage.writeFile('out/b.txt', bytes('bytes'));
    expect([...files.written]).toEqual([
      ['out/a.txt', 'text'],
      ['out/b.txt', 'bytes'],
    ]);
  });
});
