import type { Diagnostic, Fix } from './diagnostic.js';
import { BODY_STYLE } from './default-styles.js';
import { COVER_END_RESERVE_PT, coverAreaHeightPt, coverAreaWidthPt, placeAreas } from './cover.js';
import { MIN_TEXT_AREA_PT, PAGE_SIZES, PAGE_SIZE_NAMES } from './page-template.js';
import { isSafeRelativePath } from './project.js';
import { inheritanceChain, resolveParagraphStyle, resolveTableStyle } from './style-resolution.js';
import type { StyleName } from './style-name.js';
import {
  PARAGRAPH_PROPERTIES,
  TEXT_PROPERTIES,
  type PropertyType,
  type StyleProperty,
} from './style-properties.js';
import { fixedWordStyleName, isWordBuiltInStyleName } from './word-style-names.js';
import {
  PAGINATION_TOKENS,
  RESERVED_PARAGRAPH_STYLES,
  RESERVED_TABLE_STYLE,
  VARIANT_MARKS,
  type Border,
  type ColorValue,
  type CoverEntry,
  type CoverGrid,
  type FontValue,
  type LineSpacing,
  type PageTemplate,
  type ParagraphProps,
  type SlotPart,
  type Stylesheet,
  type TextProps,
} from './stylesheet.js';

const HEX_COLOR = /^#[0-9A-F]{6}$/;
const USE_TOKENS: Fix = { kind: 'use-tokens' };

export const MAX_LABEL_LENGTH = 80;

/** A label may not have what Word would read as more than one name, or as a line break. */
function labelIsWellFormed(label: string): boolean {
  const characters = Array.from(label);
  return (
    label !== '' &&
    label === label.trim() &&
    characters.length <= MAX_LABEL_LENGTH &&
    !characters.some((char) => {
      const code = char.charCodeAt(0);
      return code < 0x20 || code === 0x7f || char === ',' || char === ';';
    })
  );
}

/** Checks everything about a stylesheet that does not depend on how it was written down. */
export function validateStylesheet(stylesheet: Stylesheet): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, path: string, fix?: Fix): void => {
    diagnostics.push({
      severity: 'error',
      code,
      message,
      path,
      ...(fix === undefined ? {} : { fix }),
    });
  };

  const checkHex = (hex: string, path: string): void => {
    if (!HEX_COLOR.test(hex)) error('invalid-value', `"${hex}" is not a #RRGGBB color.`, path);
  };
  /** A color of a style is the name of a color token (ADR 0065). */
  const checkColor = (value: ColorValue | undefined, path: string): void => {
    if (value === undefined) return;
    if (value.kind === 'token') {
      if (!stylesheet.tokens.colors.has(value.name)) {
        error('unknown-token', `There is no color token "${value.name}".`, path);
      }
      return;
    }
    if (!HEX_COLOR.test(value.hex)) {
      error('invalid-value', `"${value.hex}" is not a #RRGGBB color.`, path);
      return;
    }
    const same = [...stylesheet.tokens.colors].find(([, hex]) => hex === value.hex)?.[0];
    error(
      'raw-color',
      same === undefined
        ? `Colors come from the color tokens. Add ${value.hex} to tokens.colors under a name, and use that name here.`
        : `Colors come from the color tokens. Use the token "${same}" (${value.hex}) here.`,
      path,
      USE_TOKENS,
    );
  };
  const checkFamilies = (families: readonly string[], path: string): void => {
    if (families.length === 0 || families.some((family) => family === '')) {
      error('invalid-value', 'A font needs at least one family name.', path);
    }
  };
  /** A font of a style is the name of a font token (ADR 0065). */
  const checkFont = (value: FontValue | undefined, path: string): void => {
    if (value === undefined) return;
    if (value.kind === 'token') {
      if (!stylesheet.tokens.fonts.has(value.name)) {
        error('unknown-token', `There is no font token "${value.name}".`, path);
      }
      return;
    }
    if (value.families.length === 0 || value.families.some((family) => family === '')) {
      checkFamilies(value.families, path);
      return;
    }
    const list = value.families.join('\u0000');
    const same = [...stylesheet.tokens.fonts].find(([, f]) => f.join('\u0000') === list)?.[0];
    error(
      'raw-font',
      same === undefined
        ? 'Fonts come from the font tokens. Add the families to tokens.fonts under a name, and use that name here.'
        : `Fonts come from the font tokens. Use the token "${same}" here.`,
      path,
      USE_TOKENS,
    );
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

  /** Checks a value by the kind and the range that the list of properties gives for it. */
  const checkValue = (type: PropertyType, value: unknown, path: string): void => {
    switch (type.kind) {
      case 'font':
        checkFont(value as FontValue, path);
        return;
      case 'color':
        checkColor(value as ColorValue, path);
        return;
      case 'number':
        if (type.range === 'positive') checkPositive(value as number, path);
        else if (type.range === 'non-negative') checkNotNegative(value as number, path);
        else checkFinite(value as number, path);
        return;
      case 'line-spacing': {
        const spacing = value as LineSpacing;
        checkPositive(spacing.rule === 'multiple' ? spacing.factor : spacing.pt, path);
        return;
      }
      default:
        break;
    }
  };
  const checkProperties = <P extends string>(
    properties: readonly (StyleProperty & { readonly prop: P })[],
    values: Readonly<Partial<Record<P, unknown>>>,
    path: string,
  ): void => {
    for (const { key, prop, type } of properties) {
      const value = values[prop];
      if (value !== undefined) checkValue(type, value, `${path}.${key}`);
    }
  };

  const checkText = (props: TextProps, path: string): void => {
    checkProperties(TEXT_PROPERTIES, props, path);
  };
  const checkParagraph = (props: ParagraphProps, path: string): void => {
    checkProperties(PARAGRAPH_PROPERTIES, props, path);
  };
  const checkBorder = (border: Border | undefined, path: string): void => {
    if (border === undefined) return;
    checkPositive(border.widthPt, `${path}.width`);
    checkColor(border.color, `${path}.color`);
  };

  for (const [name, hex] of stylesheet.tokens.colors) {
    checkHex(hex, `tokens.colors.${name}`);
  }
  for (const [name, families] of stylesheet.tokens.fonts) {
    checkFamilies(families, `tokens.fonts.${name}`);
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

  // Labels are compared ignoring case, as Word compares the names of styles, across all kinds.
  const labelOwners = new Map<string, string>();
  const labelled: readonly (readonly [
    string,
    ReadonlyMap<StyleName, { readonly label?: string }>,
  ])[] = [
    ['paragraph-styles', stylesheet.paragraphStyles],
    ['character-styles', stylesheet.characterStyles],
    ['table-styles', stylesheet.tableStyles],
  ];
  for (const [section, styles] of labelled) {
    for (const [name, { label }] of styles) {
      if (label === undefined) continue;
      const path = `${section}.${name}.label`;
      if (!labelIsWellFormed(label)) {
        error(
          'invalid-label',
          `A label is 1 to ${String(MAX_LABEL_LENGTH)} characters, with no spaces at either end, no commas or semicolons, and no control characters.`,
          path,
        );
        continue;
      }
      const owner = labelOwners.get(label.toLowerCase());
      if (owner !== undefined) {
        error('duplicate-label', `The label "${label}" is also the label of "${owner}".`, path);
        continue;
      }
      labelOwners.set(label.toLowerCase(), `${section}.${name}`);
      // A style that Word names itself keeps that name, so its label is only for the editor.
      if (fixedWordStyleName(name) === undefined && isWordBuiltInStyleName(label)) {
        error(
          'builtin-label',
          `"${label}" is the name of a style that Word has built in, so it cannot be a label.`,
          path,
        );
      }
    }
  }

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
    const checkCoverParts = (parts: readonly SlotPart[], where: string, paged = false): void => {
      for (const part of parts) {
        if (!paged && part.kind === 'token' && PAGINATION_TOKENS.includes(part.token)) {
          error(
            'cover-token-not-allowed',
            `The token "${part.token}" depends on pagination and cannot be used on a cover or in a title block.`,
            where,
          );
        }
      }
    };
    const checkEntry = (entry: CoverEntry, here: string, paged = false): void => {
      if (entry.kind === 'image') {
        if (!isSafeRelativePath(entry.path)) {
          error(
            'invalid-value',
            'The image must be a relative path with "/" separators and no "..".',
            `${here}.image`,
          );
        }
        if (entry.widthPt !== undefined && !(Number.isFinite(entry.widthPt) && entry.widthPt > 0)) {
          error('invalid-value', 'The width must be a number of points above 0.', `${here}.width`);
        }
        if (entry.style !== undefined && !stylesheet.paragraphStyles.has(entry.style)) {
          error(
            'unknown-cover-style',
            `The style "${entry.style}" is not a paragraph style.`,
            `${here}.style`,
          );
        } else if (
          resolveParagraphStyle(stylesheet, entry.style ?? BODY_STYLE)?.paragraph.lineSpacing
            ?.rule === 'exactly'
        ) {
          diagnostics.push({
            severity: 'warning',
            code: 'image-line-spacing',
            message: `The style "${entry.style ?? BODY_STYLE}" has exact line spacing, which cuts off the image in Word.`,
            path: `${here}.style`,
          });
        }
        return;
      }
      if (entry.kind === 'paragraph') {
        if (entry.style !== undefined && !stylesheet.paragraphStyles.has(entry.style)) {
          error(
            'unknown-cover-style',
            `The style "${entry.style}" is not a paragraph style.`,
            `${here}.style`,
          );
        }
        checkCoverParts(entry.text, `${here}.text`, paged);
        return;
      }
      if (!stylesheet.tableStyles.has(entry.style)) {
        error(
          'unknown-cover-style',
          `The style "${entry.style}" is not a table style.`,
          `${here}.table.style`,
        );
      }
      entry.rows.forEach((row, rowIndex) => {
        checkCoverParts(row.value, `${here}.table.rows[${String(rowIndex)}].value`, paged);
      });
    };
    const checkGrid = (grid: CoverGrid, widthPt: number, here: string, paged = false): void => {
      grid.columns.forEach((column, index) => {
        const where = `${here}.columns[${String(index)}]`;
        if (column.kind === 'points' && !(Number.isFinite(column.pt) && column.pt > 0)) {
          error('invalid-value', 'A width must be a number of points above 0.', where);
        }
        if (column.kind === 'share' && !(Number.isFinite(column.fr) && column.fr > 0)) {
          error('invalid-value', 'A share must be above 0, such as "1fr".', where);
        }
      });
      if (grid.areas.length !== grid.rows.length) {
        error(
          'cover-areas-shape',
          `The areas have ${String(grid.areas.length)} lines for ${String(grid.rows.length)} rows.`,
          `${here}.areas`,
        );
      }
      for (const problem of placeAreas(grid.areas, grid.columns.length).problems) {
        error('cover-areas-shape', problem, `${here}.areas`);
      }
      const named = new Set(grid.areas.flat());
      for (const [name, area] of Object.entries(grid.area)) {
        if (!named.has(name)) {
          error('unknown-cover-area', `The areas have no area "${name}".`, `${here}.area.${name}`);
        }
        checkColor(area.background, `${here}.area.${name}.background`);
        area.content.forEach((entry, index) => {
          checkEntry(entry, `${here}.area.${name}.content[${String(index)}]`, paged);
        });
      }
      const fixed = grid.columns.reduce(
        (sum, column) => sum + (column.kind === 'points' ? column.pt : 0),
        0,
      );
      if (widthPt >= MIN_TEXT_AREA_PT && fixed > widthPt) {
        error(
          'cover-too-wide',
          `The columns are ${String(Math.round(fixed))} pt wide together, more than the ${String(Math.floor(widthPt))} pt they have.`,
          `${here}.columns`,
        );
      }
    };
    const checkCover = (page: PageTemplate, here: string): void => {
      const cover = page.cover;
      if (cover === undefined) return;
      if (cover.kind === 'list') {
        cover.entries.forEach((entry, index) => {
          checkEntry(entry, `${here}[${String(index)}]`);
        });
        return;
      }
      const heights = cover.kind === 'grid' ? cover.rows : cover.rows.map((row) => row.height);
      const heightPath = (index: number): string =>
        cover.kind === 'grid'
          ? `${here}.rows[${String(index)}]`
          : `${here}.rows[${String(index)}].height`;
      heights.forEach((height, index) => {
        if (height.kind === 'points' && !(Number.isFinite(height.pt) && height.pt > 0)) {
          error('invalid-value', 'A height must be a number of points above 0.', heightPath(index));
        }
        if (height.kind === 'share' && !(Number.isFinite(height.fr) && height.fr > 0)) {
          error('invalid-value', 'A share must be above 0, such as "1fr".', heightPath(index));
        }
      });
      if (cover.kind === 'rows') {
        cover.rows.forEach((row, index) => {
          checkColor(row.background, `${here}.rows[${String(index)}].background`);
          row.content.forEach((entry, entryIndex) => {
            checkEntry(entry, `${here}.rows[${String(index)}].content[${String(entryIndex)}]`);
          });
        });
      } else {
        checkGrid(cover, coverAreaWidthPt(page), here);
      }
      const kinds = new Set(heights.map((height) => height.kind));
      if (kinds.has('share') && kinds.has('auto')) {
        error(
          'cover-share-with-auto',
          'A cover cannot have rows with a share ("fr") and rows without a height: the height that is left is not known.',
          `${here}.rows`,
        );
      }
      const own = cover.margins ?? {};
      for (const [side, value] of [
        ['top', own.topPt],
        ['right', own.rightPt],
        ['bottom', own.bottomPt],
        ['left', own.leftPt],
      ] as const) {
        checkNotNegative(value, `${here}.margins.${side}`);
      }
      const width = coverAreaWidthPt(page);
      const height = coverAreaHeightPt(page);
      if (width < MIN_TEXT_AREA_PT || height < MIN_TEXT_AREA_PT) {
        error(
          'invalid-value',
          `The margins must leave a text area of at least ${String(MIN_TEXT_AREA_PT)} pt each way.`,
          `${here}.margins`,
        );
        return;
      }
      const fixed = heights.reduce(
        (sum, height) => sum + (height.kind === 'points' ? height.pt : 0),
        0,
      );
      if (fixed > height - COVER_END_RESERVE_PT) {
        error(
          'cover-too-tall',
          `The rows are ${String(Math.round(fixed))} pt high together, more than the ${String(Math.floor(height - COVER_END_RESERVE_PT))} pt of the cover page.`,
          `${here}.rows`,
        );
      }
    };
    if (template.cover !== undefined) checkCover(template, `${path}.cover`);
    // A header or a footer that is a grid (ADR 0095): its rows grow or have points.
    for (const part of ['header', 'footer'] as const) {
      const spec = template[part];
      const here = `${path}.${part}`;
      if (
        spec?.distancePt !== undefined &&
        !(Number.isFinite(spec.distancePt) && spec.distancePt >= 0)
      ) {
        error(
          'invalid-value',
          'The distance must be a number of points, 0 or more.',
          `${here}.distance`,
        );
      }
      const grid = spec?.grid;
      if (grid === undefined) continue;
      grid.rows.forEach((row, index) => {
        const where = `${here}.rows[${String(index)}]`;
        if (row.kind === 'share') {
          error(
            'header-row-share',
            'A row of a header or footer grows or has points; it cannot have a share.',
            where,
          );
        } else if (row.kind === 'points' && !(Number.isFinite(row.pt) && row.pt > 0)) {
          error('invalid-value', 'A height must be a number of points above 0.', where);
        }
      });
      const page = PAGE_SIZES[template.size];
      checkGrid(
        grid,
        page.widthPt - template.margins.leftPt - template.margins.rightPt,
        here,
        true,
      );
    }
    template.titleBlock?.forEach((entry, index) => {
      checkEntry(entry, `${path}.title-block[${String(index)}]`);
    });
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
    checkColor(style.bandedRows?.odd, `${path}.banded-rows.odd`);
    checkColor(style.bandedRows?.even, `${path}.banded-rows.even`);
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
    for (const { prop, key } of TEXT_PROPERTIES) {
      if (table.headerRow.text[prop] !== undefined && cell.text[prop] !== undefined) {
        diagnostics.push({
          severity: 'warning',
          code: 'header-property-overridden',
          message: `The cell style "${cell.name}" also sets this property, so Word will not apply it in the header row.`,
          path: `table-styles.${name}.header-row.${key}`,
        });
      }
    }
  }

  return diagnostics;
}
