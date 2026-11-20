import { describe, expect, it } from 'vitest';
import { formatAnnotation, parseAnnotation } from './annotation.js';

const ID = 'k7m2q9x4zb';

describe('parseAnnotation', () => {
  it('reads id, style, and widths', () => {
    const parsed = parseAnnotation(`<!-- stanza: #${ID} .table-grid widths="30 70" -->`, 1);
    expect(parsed?.annotation).toEqual({ id: ID, style: 'table-grid', widths: [30, 70] });
    expect(parsed?.diagnostics).toEqual([]);
  });

  it('ignores indentation and token order', () => {
    const parsed = parseAnnotation(`   <!-- stanza: .cover-title #${ID} -->`, 1);
    expect(parsed?.annotation).toEqual({ id: ID, style: 'cover-title' });
  });

  it('returns undefined for lines that are not annotations', () => {
    expect(parseAnnotation(`<!-- #${ID} -->`, 1)).toBeUndefined();
    expect(parseAnnotation(`#${ID}`, 1)).toBeUndefined();
    expect(parseAnnotation('text', 1)).toBeUndefined();
  });

  it.each([
    ['invalid id', '<!-- stanza: #NOT-AN-ID -->', 'error', 'annotation-invalid-id'],
    ['invalid style', '<!-- stanza: .Bad_Style -->', 'error', 'annotation-invalid-style'],
    ['invalid widths', '<!-- stanza: widths="a b" -->', 'error', 'annotation-invalid-widths'],
    ['unknown key', '<!-- stanza: color="red" -->', 'warning', 'annotation-unknown-key'],
    ['stray token', '<!-- stanza: nonsense -->', 'warning', 'annotation-unexpected-token'],
    ['duplicate id', `<!-- stanza: #${ID} #n3d8w5r1ya -->`, 'warning', 'annotation-duplicate'],
  ])('reports %s', (_label, line, severity, code) => {
    const parsed = parseAnnotation(line, 7);
    expect(parsed?.diagnostics).toEqual([expect.objectContaining({ severity, code, line: 7 })]);
  });
});

describe('formatAnnotation', () => {
  it('writes id, style, and widths in that order', () => {
    const annotation = parseAnnotation(`<!-- stanza: widths="30 70" .table-grid #${ID} -->`, 1);
    expect(formatAnnotation(annotation?.annotation ?? {})).toBe(
      `<!-- stanza: #${ID} .table-grid widths="30 70" -->`,
    );
  });

  it('returns undefined when there is nothing to record', () => {
    expect(formatAnnotation({})).toBeUndefined();
  });
});
