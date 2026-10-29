import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeStorage } from './node-storage.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'phrase-storage-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('nodeStorage', () => {
  it('reads text, lists one directory, and writes files with their directories', async () => {
    const storage = nodeStorage(root);
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'a.txt'), 'héllo');
    expect(await storage.readText('a.txt')).toBe('héllo');
    const entries = [...(await storage.list(''))].sort((a, b) => a.name.localeCompare(b.name));
    expect(entries).toEqual([
      { name: 'a.txt', directory: false },
      { name: 'sub', directory: true },
    ]);
    await storage.writeFile('out/deep/b.bin', new Uint8Array([1, 2, 3]));
    expect([...readFileSync(join(root, 'out', 'deep', 'b.bin'))]).toEqual([1, 2, 3]);
  });

  it.each(['../x', '/etc/passwd', 'a/../../b', 'a\\b', 'C:/x'])(
    'refuses the path "%s", which leaves the root',
    async (path) => {
      const storage = nodeStorage(root);
      await expect(storage.readText(path)).rejects.toThrow('Unsafe path');
      await expect(storage.list(path)).rejects.toThrow('Unsafe path');
      await expect(storage.writeFile(path, new Uint8Array())).rejects.toThrow('Unsafe path');
    },
  );

  it('rejects when a file cannot be read', async () => {
    await expect(nodeStorage(root).readText('missing.txt')).rejects.toThrow();
  });
});
