import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDocumentText } from './check.js';
import { parseProject } from './project.js';
import { parseStylesheet } from './stylesheet.js';

const { stylesheet } = parseStylesheet(
  readFileSync(new URL('../../../fixtures/stylesheet/default.yaml', import.meta.url), 'utf8'),
);

const { settings } = parseProject(
  readFileSync(new URL('../../../fixtures/project/phrase.yaml', import.meta.url), 'utf8'),
);

const HEADER = '---\nphrase-format: 1\n---\n\n';

describe('checkDocumentText', () => {
  it('finds nothing wrong with a clean document', () => {
    const text = `${HEADER}<!-- phrase: #k7m2q9x4zb -->\n# Title\n\nSome **strong** text.\n`;
    expect(checkDocumentText(text, stylesheet).diagnostics).toEqual([]);
  });

  it('reports unsupported constructs, then problems against the stylesheet', () => {
    const text =
      `${HEADER}<!-- phrase: #k7m2q9x4zb -->\n# A **bold** title\n\n` +
      `<div>raw</div>\n\n<!-- phrase: .missing -->\nText.\n`;
    expect(checkDocumentText(text, stylesheet).diagnostics.map((d) => d.code)).toEqual([
      'html-unsupported',
      'mark-not-allowed',
      'unknown-style',
    ]);
  });

  it('numbers reading problems by line and points to the model for the others', () => {
    const text = `${HEADER}Text\n\n---\n\n# No ID\n`;
    expect(checkDocumentText(text, stylesheet).diagnostics).toEqual([
      expect.objectContaining({ code: 'thematic-break-unsupported', line: 7 }),
      expect.objectContaining({ code: 'missing-id', path: 'blocks[1]' }),
    ]);
  });

  it('checks metadata against the project when it is given', () => {
    const text = `${HEADER}Text.\n`.replace('---\n\n', 'title: T\n---\n\n');
    const codes = checkDocumentText(text, stylesheet, settings).diagnostics.map((d) => d.code);
    expect(codes).toContain('missing-field');
    expect(checkDocumentText(text, stylesheet).diagnostics.map((d) => d.code)).not.toContain(
      'missing-field',
    );
  });
});
