import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDocumentText } from './check.js';
import { parseProject } from './project.js';
import { parseStylesheet } from './stylesheet.js';
import { parseDocument } from './parse.js';
import { serializeDocument } from './serialize.js';

const { stylesheet } = parseStylesheet(
  readFileSync(
    new URL('../../../fixtures/example-project/styles/default.yaml', import.meta.url),
    'utf8',
  ),
);

const { settings } = parseProject(
  readFileSync(new URL('../../../fixtures/example-project/phrase.yaml', import.meta.url), 'utf8'),
);

const HEADER = '---\nphrase-format: 1\n---\n\n';

describe('checkDocumentText', () => {
  it('checks configured schemes in nested content while keeping short links deterministic', () => {
    const source = `${HEADER}- [ticket](jira://PROJ-123)\n\n<!-- phrase: #aaaaaaaaaa -->\n| H |\n| --- |\n| [missing](jira://) |\n\n[unknown](other://x)\n`;
    const project = {
      ...settings,
      fields: undefined,
      linkSchemes: { jira: 'https://example.org/{id}' },
    };
    expect(checkDocumentText(source, stylesheet, project).diagnostics).toMatchObject([
      { code: 'missing-link-id', path: 'blocks[1].rows[0][0].blocks[0].content' },
      { code: 'unknown-link-scheme', path: 'blocks[2].content' },
    ]);
    const once = serializeDocument(parseDocument(source).document);
    expect(once).toBe(source);
    expect(serializeDocument(parseDocument(once).document)).toBe(once);
  });

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

  it('accepts a reference to a block of another document only when the project IDs say so', () => {
    const text = `${HEADER}See [there](#k7m2q9x4zb).\n`;
    const codes = (projectIds?: ReadonlySet<string>): string[] =>
      checkDocumentText(text, stylesheet, undefined, projectIds === undefined ? {} : { projectIds })
        .diagnostics.filter((d) => d.code === 'broken-reference')
        .map((d) => d.code);
    expect(codes()).toEqual(['broken-reference']);
    expect(codes(new Set(['k7m2q9x4zb']))).toEqual([]);
    expect(codes(new Set(['aaaaaaaaaa']))).toEqual(['broken-reference']);
  });
});
