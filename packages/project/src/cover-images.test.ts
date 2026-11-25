import { describe, expect, it } from 'vitest';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';

/** The start of a PNG of the given size: enough for the size to be read. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const PROJECT = "stanza-format: 1\ntitle: 'P'\nstylesheet: 'styles.yaml'\n";
const RESERVED = [
  'body',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'code',
  'list-bulleted',
  'list-numbered',
]
  .map((name) => `  ${name}: {}`)
  .join('\n');

/** A stylesheet whose default page template has the given cover, indented as its value. */
const styles = (cover: string): string =>
  `stanza-format: 1\nparagraph-styles:\n${RESERVED}\ntable-styles:\n  table: {}\npage-templates:\n  page:\n    cover:\n${cover}\n`;

async function load(cover: string, binary: Record<string, Uint8Array>) {
  const storage = memoryStorage(
    { 'stanza.yaml': PROJECT, 'styles.yaml': styles(cover) },
    [],
    binary,
  );
  return loadProject(storage);
}

/** What loading found in the stylesheet; the project has no documents, which is another finding. */
const findings = (loaded: Awaited<ReturnType<typeof load>>) =>
  loaded.diagnostics
    .filter((d) => d.file === 'styles.yaml')
    .map((d) => [d.severity, d.code, d.file, d.path]);

describe('the images of a cover', () => {
  it('are read when the project loads, once for each path', async () => {
    const logo = png(480, 160);
    const loaded = await load(
      [
        '      rows:',
        '        - height: 100',
        '          content:',
        '            - { image: assets/logo.png, width: 150 }',
        '            - { image: assets/logo.png, width: 100 }',
      ].join('\n'),
      { 'assets/logo.png': logo },
    );
    expect(findings(loaded)).toEqual([]);
    expect([...loaded.images.entries()]).toEqual([
      ['assets/logo.png', { format: 'png', widthPx: 480, heightPx: 160, bytes: logo }],
    ]);
  });

  it('reports a missing image and one that is not a PNG or JPEG, at their entries', async () => {
    const loaded = await load(
      ['      - image: assets/gone.png', '      - image: assets/logo.svg'].join('\n'),
      { 'assets/logo.svg': new TextEncoder().encode('<svg/>') },
    );
    expect(findings(loaded)).toEqual([
      ['error', 'image-not-found', 'styles.yaml', 'page-templates.page.cover[0].image'],
      ['error', 'image-unsupported', 'styles.yaml', 'page-templates.page.cover[1].image'],
    ]);
    expect(loaded.images.size).toBe(0);
  });

  it('warns about an image wider than the cover, or higher than its row', async () => {
    const loaded = await load(
      [
        '      rows:',
        '        - height: 20',
        '          content:',
        '            - { image: assets/wide.png, width: 1000 }',
        '            - image: assets/tall.png',
      ].join('\n'),
      { 'assets/wide.png': png(1000, 10), 'assets/tall.png': png(100, 100) },
    );
    expect(findings(loaded)).toEqual([
      [
        'warning',
        'image-too-wide',
        'styles.yaml',
        'page-templates.page.cover.rows[0].content[0].width',
      ],
      [
        'warning',
        'image-too-tall',
        'styles.yaml',
        'page-templates.page.cover.rows[0].content[1].image',
      ],
    ]);
  });

  it('reads the images of a title block, which may be as wide as the body text', async () => {
    const storage = memoryStorage(
      {
        'stanza.yaml': PROJECT,
        'styles.yaml': styles('      - text: x').replace(
          '    cover:\n      - text: x\n',
          '    title-block:\n      - { image: assets/mark.png, width: 500 }\n',
        ),
      },
      [],
      { 'assets/mark.png': png(90, 30) },
    );
    const loaded = await loadProject(storage);
    expect(findings(loaded)).toEqual([
      ['warning', 'image-too-wide', 'styles.yaml', 'page-templates.page.title-block[0].width'],
    ]);
    expect([...loaded.images.keys()]).toEqual(['assets/mark.png']);
  });
});
