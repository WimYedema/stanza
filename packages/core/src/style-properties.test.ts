import { describe, expect, it } from 'vitest';
import {
  PARAGRAPH_PROPERTIES,
  STYLE_PROPERTIES,
  TEXT_PROPERTIES,
  propertyKeys,
  type NumberRange,
  type PropertyPlace,
} from './style-properties.js';
import type { ParagraphProps, TextProps } from './stylesheet.js';
import { validateStylesheet } from './style-validation.js';
import { plainStyle, sheet } from './stylesheet.testing.js';

const PLACES: readonly PropertyPlace[] = [
  'paragraph-style',
  'character-style',
  'table-style',
  'variant',
  'header-row',
  'borders',
  'border',
];

describe('the list of style properties', () => {
  it('names each property once in a place, in kebab-case', () => {
    for (const place of PLACES) {
      const keys = propertyKeys(place);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('gives the keys that a stylesheet file can have in each place', () => {
    const text = ['font', 'size', 'bold', 'italic', 'underline', 'color', 'highlight'];
    const paragraph = [
      'space-before',
      'space-after',
      'indent-left',
      'first-line-indent',
      'line-spacing',
      'alignment',
      'keep-with-next',
      'keep-together',
      'page-break-before',
      'background',
      'numbered',
    ];
    expect(propertyKeys('paragraph-style')).toEqual([
      'based-on',
      'label',
      ...text,
      ...paragraph,
      'variants',
    ]);
    expect(propertyKeys('character-style')).toEqual(['based-on', 'label', ...text]);
    expect(propertyKeys('variant')).toEqual(text);
    expect(propertyKeys('table-style')).toEqual([
      'based-on',
      'label',
      'cell-style',
      'border',
      'header-row',
      'cell-padding',
    ]);
    expect(propertyKeys('header-row')).toEqual([...text, 'background', 'repeat']);
    expect(propertyKeys('borders')).toEqual(['outer', 'inside-horizontal', 'inside-vertical']);
    expect(propertyKeys('border')).toEqual(['width', 'color']);
  });

  it('has a property for each field of the text and paragraph properties of the model', () => {
    // A sample with every field, which the compiler checks against the model.
    const text: Required<TextProps> = {
      font: { kind: 'token', name: 'x' },
      sizePt: 1,
      bold: true,
      italic: true,
      underline: true,
      color: { kind: 'token', name: 'x' },
      highlight: { kind: 'token', name: 'x' },
    };
    const paragraph: Required<ParagraphProps> = {
      spaceBeforePt: 1,
      spaceAfterPt: 1,
      lineSpacing: { rule: 'multiple', factor: 1 },
      indentLeftPt: 1,
      firstLineIndentPt: 1,
      alignment: 'left',
      keepWithNext: true,
      keepTogether: true,
      pageBreakBefore: true,
      numbered: true,
      background: { kind: 'token', name: 'x' },
    };
    expect(TEXT_PROPERTIES.map((p) => p.prop).sort()).toEqual(Object.keys(text).sort());
    expect(PARAGRAPH_PROPERTIES.map((p) => p.prop).sort()).toEqual(Object.keys(paragraph).sort());
  });

  it('gives every number a unit', () => {
    for (const property of STYLE_PROPERTIES) {
      if (property.type.kind === 'number') expect(property.type.unit).toBe('pt');
    }
  });

  it('agrees with the validation on which numbers may be zero or negative', () => {
    const expected: Record<NumberRange, { value: number; error: boolean }[]> = {
      positive: [
        { value: 0, error: true },
        { value: -1, error: true },
        { value: 1, error: false },
      ],
      'non-negative': [
        { value: -1, error: true },
        { value: 0, error: false },
      ],
      any: [
        { value: -1, error: false },
        { value: Number.NaN, error: true },
      ],
    };
    for (const property of [...TEXT_PROPERTIES, ...PARAGRAPH_PROPERTIES]) {
      if (property.type.kind !== 'number') continue;
      for (const { value, error } of expected[property.type.range]) {
        const style = {
          ...plainStyle,
          text: property.places.includes('variant') ? { [property.prop]: value } : {},
          paragraph: property.places.includes('variant') ? {} : { [property.prop]: value },
        };
        const found = validateStylesheet(sheet({ paragraph: { body: style } })).filter(
          (d) => d.path === `paragraph-styles.body.${property.key}`,
        );
        expect(found.length > 0, `${property.key} = ${String(value)}`).toBe(error);
      }
    }
  });
});
