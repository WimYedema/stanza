import { describe, expect, it } from 'vitest';
import type { Tokens } from '@stanza/core';
import { paragraphProps, runProps } from './docx-props.js';

const tokens: Tokens = {
  colors: new Map([['brand', '#2e75b6']]),
  fonts: new Map([['body', ['Calibri', 'Arial']]]),
};

describe('runProps', () => {
  it('maps text properties to DOCX units', () => {
    expect(
      runProps(tokens, {
        font: { kind: 'token', name: 'body' },
        sizePt: 10.5,
        bold: true,
        italic: false,
        underline: true,
        color: { kind: 'token', name: 'brand' },
      }),
    ).toEqual({
      font: 'Calibri',
      size: 21,
      bold: true,
      italics: false,
      underline: { type: 'single' },
      color: '2E75B6',
    });
  });

  it('uses the first family of a list and writes highlight as shading', () => {
    expect(
      runProps(tokens, {
        font: { kind: 'families', families: ['Consolas', 'Courier New'] },
        highlight: { kind: 'hex', hex: '#FFFF00' },
      }),
    ).toEqual({ font: 'Consolas', shading: { type: 'clear', color: 'auto', fill: 'FFFF00' } });
  });

  it('writes nothing for nothing', () => {
    expect(runProps(tokens, {})).toEqual({});
  });
});

describe('paragraphProps', () => {
  it('maps spacing, indents and flags to twips', () => {
    expect(
      paragraphProps(tokens, {
        spaceBeforePt: 12,
        spaceAfterPt: 6,
        lineSpacing: { rule: 'multiple', factor: 1.15 },
        indentLeftPt: 36,
        firstLineIndentPt: -18,
        alignment: 'justify',
        keepWithNext: true,
        keepTogether: false,
        background: { kind: 'hex', hex: '#F2F2F2' },
      }),
    ).toEqual({
      spacing: { before: 240, after: 120, line: 276, lineRule: 'auto' },
      indent: { left: 720, hanging: 360 },
      alignment: 'both',
      keepNext: true,
      keepLines: false,
      shading: { type: 'clear', color: 'auto', fill: 'F2F2F2' },
    });
  });

  it('maps a positive first-line indent and fixed line spacing', () => {
    expect(
      paragraphProps(tokens, { firstLineIndentPt: 18, lineSpacing: { rule: 'exactly', pt: 14 } }),
    ).toEqual({ indent: { firstLine: 360 }, spacing: { line: 280, lineRule: 'exact' } });
    expect(paragraphProps(tokens, { lineSpacing: { rule: 'at-least', pt: 14 } })).toEqual({
      spacing: { line: 280, lineRule: 'atLeast' },
    });
  });

  it('leaves out page-break-before, which paragraphs carry instead', () => {
    expect(paragraphProps(tokens, { pageBreakBefore: true })).toEqual({});
  });
});
