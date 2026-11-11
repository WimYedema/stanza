import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blockStartLines, parseDocument } from './parse.js';

const FRONT = '---\nphrase-format: 1\ntitle: "T"\n---\n\n';

describe('blockStartLines', () => {
  it('gives the line where each block starts, counted from 1 in the whole file', () => {
    const text = `${FRONT}# One\n\nA paragraph.\n\n- item\n- item\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n\`\`\`ts\nlet x;\n\`\`\`\n`;
    // The front matter takes lines 1 to 4 and line 5 is empty.
    expect(blockStartLines(text)).toEqual([6, 8, 10, 13, 17]);
  });

  it('counts the annotation line before a block as the start of the block', () => {
    const text = `${FRONT}<!-- phrase: #k7m2q9x4zb -->\n# One\n\nText.\n\n<!-- phrase: .note -->\nA note.\n`;
    expect(blockStartLines(text)).toEqual([6, 9, 11]);
  });

  it('is the same for CRLF line endings and a byte order mark', () => {
    const text = `${FRONT}# One\n\nText.\n`;
    expect(blockStartLines(`\uFEFF${text.replace(/\n/g, '\r\n')}`)).toEqual(blockStartLines(text));
  });

  it('has no blocks for a document that has only front matter, or none', () => {
    expect(blockStartLines(FRONT)).toEqual([]);
    expect(blockStartLines('')).toEqual([]);
  });

  it('finds as many blocks as the reader of the dialect, in every fixture', () => {
    const folders = ['format', 'example-project/documents'].map(
      (path) => new URL(`../../../fixtures/${path}/`, import.meta.url),
    );
    let checked = 0;
    for (const folder of folders) {
      for (const name of readdirSync(folder).filter((file) => file.endsWith('.phrase.md'))) {
        const text = readFileSync(fileURLToPath(new URL(name, folder)), 'utf8');
        const parsed = parseDocument(text);
        if (parsed.diagnostics.some((d) => d.severity === 'error')) continue;
        expect(blockStartLines(text), name).toHaveLength(parsed.document.blocks.length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});
