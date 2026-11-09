import { describe, expect, it } from 'vitest';
import { normalized, reviewText } from './review.js';

const FRONT = '---\nphrase-format: 1\ntitle: "T"\n---\n\n';

describe('reviewText', () => {
  it('takes a canonical text', () => {
    const text = `${FRONT}# Title\n\nSome text.\n`;
    expect(reviewText(text)).toEqual({ ok: true, text });
  });

  it('takes a canonical text in a file with CRLF line endings, and gives it with LF', () => {
    const text = `${FRONT}# Title\n\nSome text.\n`;
    expect(reviewText(text.replace(/\n/g, '\r\n'))).toEqual({ ok: true, text });
  });

  it('offers the canonical text of one that only differs in form', () => {
    const result = reviewText(`${FRONT}* one\n* two\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formatted).toBe(`${FRONT}- one\n- two\n`);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.message).toContain('not in canonical form');
  });

  it('refuses a text with something the model cannot hold, with its line, and offers no format', () => {
    const result = reviewText(`${FRONT}Text.\n\n<div>raw</div>\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formatted).toBeUndefined();
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.message).toContain('HTML');
    expect(result.reasons[0]?.line).toBe(8);
  });

  it('takes a table with paragraphs and lists in its cells, which the editor shows', () => {
    const rich = '```phrase-table\n- - H\n- - one\n\n    two\n```\n';
    const list = `- item\n\n  \`\`\`phrase-table\n  - - H\n  - - one\n\n      two\n  \`\`\`\n`;
    for (const body of [rich, list]) {
      expect(reviewText(`${FRONT}${body}`)).toEqual({ ok: true, text: `${FRONT}${body}` });
    }
  });

  it('takes a table of plain cells, also when it was written as a phrase-table', () => {
    expect(reviewText(`${FRONT}| H |\n| --- |\n| a |\n`).ok).toBe(true);
    const written = reviewText(`${FRONT}\`\`\`phrase-table\n- - H\n- - a\n\`\`\`\n`);
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.formatted).toBe(`${FRONT}| H |\n| --- |\n| a |\n`);
  });
});

describe('normalized', () => {
  it('turns every line ending into a newline', () => {
    expect(normalized('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});
