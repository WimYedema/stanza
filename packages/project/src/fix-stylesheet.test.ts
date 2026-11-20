import { describe, expect, it } from 'vitest';
import { useTokensInStylesheet } from './fix-stylesheet.js';
import { memoryStorage } from './memory-storage.testing.js';

const PROJECT = "stanza-format: 1\ntitle: 'P'\nstylesheet: 'styles/default.yaml'\n";
const RAW = "stanza-format: 1\nparagraph-styles:\n  body:\n    color: '#112233'\n";

describe('useTokensInStylesheet', () => {
  it('writes the stylesheet that the project file names, and only that', async () => {
    const storage = memoryStorage({ 'stanza.yaml': PROJECT, 'styles/default.yaml': RAW });
    const result = await useTokensInStylesheet(storage, { check: false });
    expect(result).toMatchObject({ path: 'styles/default.yaml', status: 'changed', moved: 1 });
    expect([...storage.texts.keys()]).toEqual(['styles/default.yaml']);
    expect(storage.texts.get('styles/default.yaml')).toContain('color: color-112233');
  });

  it('writes nothing when checking, and nothing when there is nothing to move', async () => {
    const storage = memoryStorage({ 'stanza.yaml': PROJECT, 'styles/default.yaml': RAW });
    expect(await useTokensInStylesheet(storage, { check: true })).toMatchObject({
      status: 'changed',
    });
    expect(storage.texts.size).toBe(0);

    const clean = memoryStorage({
      'stanza.yaml': PROJECT,
      'styles/default.yaml': 'stanza-format: 1\n',
    });
    expect(await useTokensInStylesheet(clean, { check: false })).toMatchObject({
      status: 'unchanged',
    });
    expect(clean.texts.size).toBe(0);
  });

  it('refuses, with the reason, when the project file or the stylesheet is not in order', async () => {
    const noProject = await useTokensInStylesheet(memoryStorage({}), { check: false });
    expect(noProject).toMatchObject({ status: 'refused', path: undefined });
    expect(noProject.diagnostics[0]?.code).toBe('file-unreadable');

    const storage = memoryStorage({
      'stanza.yaml': PROJECT,
      'styles/default.yaml':
        'stanza-format: 1\nparagraph-styles:\n  code:\n    font:\n      - Consolas\n',
    });
    const refused = await useTokensInStylesheet(storage, { check: false });
    expect(refused).toMatchObject({ status: 'refused', path: 'styles/default.yaml' });
    expect(refused.diagnostics[0]).toMatchObject({
      file: 'styles/default.yaml',
      code: 'unsupported-layout',
    });
    expect(storage.texts.size).toBe(0);
  });
});
