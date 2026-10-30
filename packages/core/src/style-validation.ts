import type { Diagnostic } from './diagnostic.js';
import { BODY_STYLE } from './default-styles.js';
import { MIN_TEXT_AREA_PT, PAGE_SIZES, PAGE_SIZE_NAMES } from './page-template.js';
import { inheritanceChain, resolveParagraphStyle, resolveTableStyle } from './style-resolution.js';
import type { StyleName } from './style-name.js';
import {
  RESERVED_PARAGRAPH_STYLES,
  RESERVED_TABLE_STYLE,
  VARIANT_MARKS,
  type Border,
  type ColorValue,
  type FontValue,
  type ParagraphProps,
  type Stylesheet,
  type TextProps,
} from './stylesheet.js';

const HEX_COLOR = /^#[0-9A-F]{6}$/;

const TEXT_KEYS_YAML = {
  font: 'font',
  sizePt: 'size',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  color: 'color',
  highlight: 'highlight',
} as const satisfies Record<keyof TextProps, string>;
const TEXT_KEYS = Object.keys(TEXT_KEYS_YAML) as (keyof TextProps)[];

/** Checks everything about a stylesheet that does not depend on how it was written down. */
export function validateStylesheet(stylesheet: Stylesheet): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, path: string): void => {
    diagnostics.push({ severity: 'error', code, message, path });
  };

  const checkColor = (value: ColorValue | undefined, path: string): void => {
    if (value === undefined) return;
    if (value.kind === 'token') {
      if (!stylesheet.tokens.colors.has(value.name)) {
        error('unknown-token', `There is no color token "${value.name}".`, path);
      }
    } else if (!HEX_COLOR.test(value.hex)) {
      error('invalid-value', `"${value.hex}" is not a #RRGGBB color.`, path);
    }
  };
  const checkFont = (value: FontValue | undefined, path: string): void => {
    if (value === undefined) return;
    if (value.kind === 'token') {
      if (!stylesheet.tokens.fonts.has(value.name)) {
        error('unknown-token', `There is no font token "${value.name}".`, path);
      }
    } else if (value.families.length === 0 || value.families.some((family) => family === '')) {
      error('invalid-value', 'A font needs at least one family name.', path);
    }
  };
  const checkPositive = (value: number | undefined, path: string): void => {
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) {
      error('invalid-value', 'The value must be greater than zero.', path);
    }
  };
  const checkNotNegative = (value: number | undefined, path: string): void => {
    if (value !== undefined && !(Number.isFinite(value) && value >= 0)) {
      error('invalid-value', 'The value must not be negative.', path);
    }
  };
  const checkFinite = (value: number | undefined, path: string): void => {
    if (value !== undefined && !Number.isFinite(value)) {
      error('invalid-value', 'The value must be a number.', path);
    }
  };

  const checkText = (props: TextProps, path: string): void => {
    checkFont(props.font, `${path}.font`);
    checkPositive(props.sizePt, `${path}.size`);
    checkColor(props.color, `${path}.color`);
    checkColor(props.highlight, `${path}.highlight`);
  };
  const checkParagraph = (props: ParagraphProps, path: string): void => {
    checkNotNegative(props.spaceBeforePt, `${path}.space-before`);
    checkNotNegative(props.spaceAfterPt, `${path}.space-after`);
    checkNotNegative(props.indentLeftPt, `${path}.indent-left`);
    checkFinite(props.firstLineIndentPt, `${path}.first-line-indent`);
    checkColor(props.background, `${path}.background`);
    if (props.lineSpacing !== undefined) {
      checkPositive(
        props.lineSpacing.rule === 'multiple' ? props.lineSpacing.factor : props.lineSpacing.pt,
        `${path}.line-spacing`,
      );
    }
  };
  const checkBorder = (border: Border | undefined, path: string): void => {
    if (border === undefined) return;
    checkPositive(border.widthPt, `${path}.width`);
    checkColor(border.color, `${path}.color`);
  };

  for (const [name, hex] of stylesheet.tokens.colors) {
    checkColor({ kind: 'hex', hex }, `tokens.colors.${name}`);
  }
  for (const [name, families] of stylesheet.tokens.fonts) {
    checkFont({ kind: 'families', families }, `tokens.fonts.${name}`);
  }

  for (const required of RESERVED_PARAGRAPH_STYLES) {
    if (!stylesheet.paragraphStyles.has(required)) {
      error(
        'missing-reserved-style',
        `Paragraph style "${required}" is required.`,
        `paragraph-styles.${required}`,
      );
    }
  }
  if (!stylesheet.tableStyles.has(RESERVED_TABLE_STYLE)) {
    error(
      'missing-reserved-style',
      `Table style "${RESERVED_TABLE_STYLE}" is required.`,
      `table-styles.${RESERVED_TABLE_STYLE}`,
    );
  }

  const checkInheritance = (
    styles: ReadonlyMap<StyleName, { readonly basedOn?: StyleName }>,
    section: string,
  ): void => {
    for (const name of styles.keys()) {
      const result = inheritanceChain(styles, name);
      if (result.ok) continue;
      const path = `${section}.${name}.based-on`;
      if (result.problem === 'style-cycle') {
        error('style-cycle', `"${name}" is based on itself through "${result.name}".`, path);
      } else {
        error('unknown-base-style', `The base style "${result.name}" does not exist.`, path);
      }
    }
  };
  checkInheritance(stylesheet.paragraphStyles, 'paragraph-styles');
  checkInheritance(stylesheet.characterStyles, 'character-styles');
  checkInheritance(stylesheet.tableStyles, 'table-styles');

  for (const [name, style] of stylesheet.paragraphStyles) {
    const path = `paragraph-styles.${name}`;
    checkText(style.text, path);
    checkParagraph(style.paragraph, path);
    for (const mark of VARIANT_MARKS) {
      const variant = style.variants[mark];
      if (variant !== undefined && variant !== null) checkText(variant, `${path}.variants.${mark}`);
    }
  }
  for (const [name, style] of stylesheet.characterStyles) {
    checkText(style.text, `character-styles.${name}`);
  }
  for (const [name, template] of stylesheet.pageTemplates) {
    const path = `page-templates.${name}`;
    const { margins } = template;
    for (const part of ['header', 'footer'] as const) {
      const style = template[part]?.style;
      if (style !== undefined && !stylesheet.paragraphStyles.has(style)) {
        error(
          'unknown-slot-style',
          `The style "${style}" is not a paragraph style.`,
          `${path}.${part}.style`,
        );
      }
    }
    const sides = [
      ['top', margins.topPt],
      ['right', margins.rightPt],
      ['bottom', margins.bottomPt],
      ['left', margins.leftPt],
    ] as const;
    for (const [side, value] of sides) checkNotNegative(value, `${path}.margins.${side}`);
    if (!PAGE_SIZE_NAMES.includes(template.size)) {
      error('invalid-value', 'Expected the size A4 or Letter.', `${path}.size`);
    } else if (sides.every(([, value]) => Number.isFinite(value) && value >= 0)) {
      const page = PAGE_SIZES[template.size];
      const width = page.widthPt - margins.leftPt - margins.rightPt;
      const height = page.heightPt - margins.topPt - margins.bottomPt;
      if (width < MIN_TEXT_AREA_PT || height < MIN_TEXT_AREA_PT) {
        error(
          'invalid-value',
          `The margins must leave a text area of at least ${String(MIN_TEXT_AREA_PT)} pt each way.`,
          `${path}.margins`,
        );
      }
    }
  }
  for (const [name, style] of stylesheet.tableStyles) {
    const path = `table-styles.${name}`;
    checkBorder(style.border?.outer, `${path}.border.outer`);
    checkBorder(style.border?.insideHorizontal, `${path}.border.inside-horizontal`);
    checkBorder(style.border?.insideVertical, `${path}.border.inside-vertical`);
    if (style.headerRow !== undefined) {
      checkText(style.headerRow.text, `${path}.header-row`);
      checkColor(style.headerRow.background, `${path}.header-row.background`);
    }
    checkNotNegative(style.cellPaddingPt, `${path}.cell-padding`);
    if (style.cellStyle !== undefined && !stylesheet.paragraphStyles.has(style.cellStyle)) {
      error(
        'unknown-cell-style',
        `The cell style "${style.cellStyle}" is not a paragraph style.`,
        `${path}.cell-style`,
      );
    }
  }

  // Word lets a paragraph style win over the table style, so a header property that the cell style
  // also sets would silently not apply.
  for (const name of stylesheet.tableStyles.keys()) {
    const table = resolveTableStyle(stylesheet, name);
    const cell = resolveParagraphStyle(stylesheet, table?.cellStyle ?? BODY_STYLE);
    if (table?.headerRow === undefined || cell === undefined) continue;
    for (const key of TEXT_KEYS) {
      if (table.headerRow.text[key] !== undefined && cell.text[key] !== undefined) {
        diagnostics.push({
          severity: 'warning',
          code: 'header-property-overridden',
          message: `The cell style "${cell.name}" also sets this property, so Word will not apply it in the header row.`,
          path: `table-styles.${name}.header-row.${TEXT_KEYS_YAML[key]}`,
        });
      }
    }
  }

  return diagnostics;
}
