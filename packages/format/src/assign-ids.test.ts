import { describe, expect, it } from 'vitest';
import { assignMissingIdsInText } from './assign-ids.js';

const HEADER = '---\nstanza-format: 1\n---\n\n';

function sequence(...values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error('generator exhausted');
    return value;
  };
}

const options = () => ({ used: new Set<string>(), generate: sequence('aaaaaaaaaa', 'bbbbbbbbbb') });

describe('assignMissingIdsInText', () => {
  const source = `${HEADER}## Heading\n\nSome *text*.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n`;

  it('adds annotations and changes nothing else', () => {
    const result = assignMissingIdsInText(source, options());
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        assigned: ['aaaaaaaaaa', 'bbbbbbbbbb'],
        text:
          `${HEADER}<!-- stanza: #aaaaaaaaaa -->\n## Heading\n\nSome *text*.\n\n` +
          `<!-- stanza: #bbbbbbbbbb -->\n| A | B |\n| --- | --- |\n| 1 | 2 |\n`,
      }),
    );
  });

  it('keeps an existing style and ID, and only adds what is missing', () => {
    const text = `${HEADER}<!-- stanza: .chapter -->\n## One\n\n<!-- stanza: #cccccccccc -->\n## Two\n`;
    const result = assignMissingIdsInText(text, options());
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        assigned: ['aaaaaaaaaa'],
        text: `${HEADER}<!-- stanza: #aaaaaaaaaa .chapter -->\n## One\n\n<!-- stanza: #cccccccccc -->\n## Two\n`,
      }),
    );
  });

  it('returns the text untouched when nothing is missing', () => {
    const text = `${HEADER}Only a paragraph.\n`;
    expect(assignMissingIdsInText(text, options())).toEqual({
      ok: true,
      text,
      assigned: [],
      diagnostics: [],
    });
  });

  it('is idempotent', () => {
    const once = assignMissingIdsInText(source, options());
    if (!once.ok) throw new Error('expected success');
    expect(assignMissingIdsInText(once.text, options())).toEqual(
      expect.objectContaining({ ok: true, text: once.text, assigned: [] }),
    );
  });

  it('refuses a file that is not in canonical form', () => {
    const result = assignMissingIdsInText(`${HEADER}Setext\n======\n`, options());
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['not-canonical']);
  });

  it('refuses a file with errors', () => {
    const result = assignMissingIdsInText('No front matter\n', options());
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['front-matter-missing']);
  });

  it('reports duplicate IDs and still assigns the missing ones', () => {
    const text = `${HEADER}<!-- stanza: #cccccccccc -->\n## One\n\n<!-- stanza: #cccccccccc -->\n## Two\n\n## Three\n`;
    const result = assignMissingIdsInText(text, options());
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['duplicate-id']);
  });
});
