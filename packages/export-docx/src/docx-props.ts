import {
  AlignmentType,
  LineRuleType,
  ShadingType,
  UnderlineType,
  type IParagraphStylePropertiesOptions,
  type IRunStylePropertiesOptions,
} from 'docx';
import type {
  Alignment,
  ColorValue,
  FontValue,
  ParagraphProps,
  TextProps,
  Tokens,
} from '@stanza/core';

type Writable<T> = { -readonly [K in keyof T]: T[K] };

const twips = (pt: number): number => Math.round(pt * 20);

/** `RRGGBB` for a color value, or undefined when a token is missing. */
export function colorHex(tokens: Tokens, color: ColorValue): string | undefined {
  const value = color.kind === 'hex' ? color.hex : tokens.colors.get(color.name);
  return value?.replace(/^#/, '').toUpperCase();
}

/** DOCX uses the first family of a font. */
export function fontFamily(tokens: Tokens, font: FontValue): string | undefined {
  return font.kind === 'families' ? font.families[0] : tokens.fonts.get(font.name)?.[0];
}

export function runProps(tokens: Tokens, props: TextProps): IRunStylePropertiesOptions {
  const out: Writable<IRunStylePropertiesOptions> = {};
  const font = props.font === undefined ? undefined : fontFamily(tokens, props.font);
  if (font !== undefined) out.font = font;
  // `size` is in half-points.
  if (props.sizePt !== undefined) out.size = Math.round(props.sizePt * 2);
  if (props.bold !== undefined) out.bold = props.bold;
  if (props.italic !== undefined) out.italics = props.italic;
  if (props.underline !== undefined) {
    out.underline = { type: props.underline ? UnderlineType.SINGLE : UnderlineType.NONE };
  }
  const color = props.color === undefined ? undefined : colorHex(tokens, props.color);
  if (color !== undefined) out.color = color;
  // Word's own highlight has sixteen colors, so highlight is written as shading.
  const highlight = props.highlight === undefined ? undefined : colorHex(tokens, props.highlight);
  if (highlight !== undefined) {
    out.shading = { type: ShadingType.CLEAR, color: 'auto', fill: highlight };
  }
  return out;
}

const ALIGNMENTS: Readonly<Record<Alignment, (typeof AlignmentType)[keyof typeof AlignmentType]>> =
  {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };

/** `pageBreakBefore` is left out: the library cannot write it into a style, so paragraphs carry it. */
export function paragraphProps(
  tokens: Tokens,
  props: ParagraphProps,
): IParagraphStylePropertiesOptions {
  const out: Writable<IParagraphStylePropertiesOptions> = {};
  const spacing: Writable<NonNullable<IParagraphStylePropertiesOptions['spacing']>> = {};
  if (props.spaceBeforePt !== undefined) spacing.before = twips(props.spaceBeforePt);
  if (props.spaceAfterPt !== undefined) spacing.after = twips(props.spaceAfterPt);
  const line = props.lineSpacing;
  if (line?.rule === 'multiple') {
    spacing.line = Math.round(line.factor * 240);
    spacing.lineRule = LineRuleType.AUTO;
  } else if (line !== undefined) {
    spacing.line = twips(line.pt);
    spacing.lineRule = line.rule === 'at-least' ? LineRuleType.AT_LEAST : LineRuleType.EXACT;
  }
  if (Object.keys(spacing).length > 0) out.spacing = spacing;

  const indent: Writable<NonNullable<IParagraphStylePropertiesOptions['indent']>> = {};
  if (props.indentLeftPt !== undefined) indent.left = twips(props.indentLeftPt);
  if (props.firstLineIndentPt !== undefined) {
    if (props.firstLineIndentPt < 0) indent.hanging = twips(-props.firstLineIndentPt);
    else indent.firstLine = twips(props.firstLineIndentPt);
  }
  if (Object.keys(indent).length > 0) out.indent = indent;

  if (props.alignment !== undefined) out.alignment = ALIGNMENTS[props.alignment];
  if (props.keepWithNext !== undefined) out.keepNext = props.keepWithNext;
  if (props.keepTogether !== undefined) out.keepLines = props.keepTogether;
  const background =
    props.background === undefined ? undefined : colorHex(tokens, props.background);
  if (background !== undefined) {
    out.shading = { type: ShadingType.CLEAR, color: 'auto', fill: background };
  }
  return out;
}
