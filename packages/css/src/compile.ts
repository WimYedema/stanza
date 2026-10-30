import {
  resolveCharacterStyle,
  resolveParagraphStyle,
  resolveTableStyle,
  validateStylesheet,
  VARIANT_MARKS,
  type ColorValue,
  type Diagnostic,
  type FontValue,
  type ParagraphProps,
  type StyleName,
  type Stylesheet,
  type TextProps,
} from '@phrase/core';
import {
  LIST_CLASS,
  SCOPE_CLASS,
  characterClass,
  listItemClass,
  markClass,
  paragraphClass,
  tableClass,
} from './class-names.js';

export interface CssOptions {
  /** The class of the editor root that every rule is scoped to. Defaults to `phrase-document`. */
  readonly scopeClass?: string;
}

export interface CssResult {
  /** Undefined when the stylesheet has errors. */
  readonly css: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

/** Declarations in the order they were first set; setting a name again changes its value. */
type Declarations = Map<string, string>;

const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** The paper that the editor shows, whatever the theme of the host. */
const PAPER = new Map([
  ['background-color', '#FFFFFF'],
  ['color', '#000000'],
  ['font-size', '11pt'],
]);

const number = (value: number): string => String(Math.round(value * 1000) / 1000);
const pt = (value: number): string => (value === 0 ? '0' : `${number(value)}pt`);

/** A CSS string with everything that could end it or the style element written as an escape. */
function cssString(text: string): string {
  const escaped = Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const unsafe = code < 0x20 || code === 0x7f || '\\"<>&'.includes(char);
      return unsafe ? `\\${code.toString(16)} ` : char;
    })
    .join('');
  return `"${escaped}"`;
}

const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

class Compiler {
  constructor(
    private readonly stylesheet: Stylesheet,
    private readonly scope: string,
  ) {}

  private color(value: ColorValue): string | undefined {
    return value.kind === 'hex' ? value.hex : this.stylesheet.tokens.colors.get(value.name);
  }

  private fonts(value: FontValue): readonly string[] | undefined {
    return value.kind === 'families'
      ? value.families
      : this.stylesheet.tokens.fonts.get(value.name);
  }

  private text(props: TextProps, into: Declarations): void {
    const families = props.font === undefined ? undefined : this.fonts(props.font);
    if (families !== undefined) into.set('font-family', families.map(cssString).join(', '));
    if (props.sizePt !== undefined) into.set('font-size', pt(props.sizePt));
    if (props.bold !== undefined) into.set('font-weight', props.bold ? '700' : '400');
    if (props.italic !== undefined) into.set('font-style', props.italic ? 'italic' : 'normal');
    if (props.underline !== undefined) {
      into.set('text-decoration', props.underline ? 'underline' : 'none');
    }
    const color = props.color === undefined ? undefined : this.color(props.color);
    if (color !== undefined) into.set('color', color);
    const highlight = props.highlight === undefined ? undefined : this.color(props.highlight);
    if (highlight !== undefined) into.set('background-color', highlight);
  }

  private paragraph(props: ParagraphProps, into: Declarations, firstLine: boolean): void {
    if (props.spaceBeforePt !== undefined) into.set('margin-top', pt(props.spaceBeforePt));
    if (props.spaceAfterPt !== undefined) into.set('margin-bottom', pt(props.spaceAfterPt));
    if (props.indentLeftPt !== undefined) into.set('margin-left', pt(props.indentLeftPt));
    if (firstLine && props.firstLineIndentPt !== undefined) {
      into.set('text-indent', pt(props.firstLineIndentPt));
    }
    const spacing = props.lineSpacing;
    if (spacing !== undefined) {
      into.set(
        'line-height',
        spacing.rule === 'multiple' ? number(spacing.factor) : pt(spacing.pt),
      );
    }
    if (props.alignment !== undefined) into.set('text-align', props.alignment);
    const background = props.background === undefined ? undefined : this.color(props.background);
    if (background !== undefined) into.set('background-color', background);
  }

  private rule(selectors: readonly string[], declarations: Declarations): string {
    const lines = [...declarations].map(([name, value]) => `  ${name}: ${value};`);
    const list = selectors.map((selector) => `.${this.scope} ${selector}`).join(',\n');
    return `${list} {\n${lines.join('\n')}\n}`;
  }

  /** What a browser would otherwise add to a block, so that only the style decides. */
  private blockReset(listItem: boolean): Declarations {
    const reset: Declarations = new Map([
      ['margin-top', '0'],
      ['margin-bottom', '0'],
      ['margin-left', '0'],
    ]);
    // Outside markers already give a list item its hanging indent.
    if (!listItem) reset.set('text-indent', '0');
    reset.set('font-size', 'inherit');
    reset.set('font-weight', '400');
    reset.set('font-style', 'normal');
    return reset;
  }

  private paragraphRules(name: StyleName): string[] {
    const style = resolveParagraphStyle(this.stylesheet, name);
    if (style === undefined) return [];
    const rules: string[] = [];
    for (const listItem of [false, true]) {
      const declarations = this.blockReset(listItem);
      this.text(style.text, declarations);
      this.paragraph(style.paragraph, declarations, !listItem);
      const selector = `.${listItem ? listItemClass(name) : paragraphClass(name)}`;
      rules.push(this.rule([selector], declarations));
    }
    for (const mark of VARIANT_MARKS) {
      const variant = style.variants[mark];
      if (variant === undefined) continue;
      const declarations: Declarations = new Map();
      this.text(variant, declarations);
      if (declarations.size === 0) continue;
      const within = (cls: string): string => `.${cls} .${markClass(mark)}`;
      rules.push(
        this.rule([within(paragraphClass(name)), within(listItemClass(name))], declarations),
      );
    }
    return rules;
  }

  private characterRule(name: StyleName): string[] {
    const props = resolveCharacterStyle(this.stylesheet, name);
    if (props === undefined) return [];
    const declarations: Declarations = new Map();
    this.text(props, declarations);
    return declarations.size === 0 ? [] : [this.rule([`.${characterClass(name)}`], declarations)];
  }

  private tableRules(name: StyleName): string[] {
    const style = resolveTableStyle(this.stylesheet, name);
    if (style === undefined) return [];
    const table = `.${tableClass(name)}`;
    const border = (width: number, color: ColorValue): string | undefined => {
      const value = this.color(color);
      return value === undefined ? undefined : `${pt(width)} solid ${value}`;
    };
    const rules: string[] = [];
    const whole: Declarations = new Map([
      ['border-collapse', 'collapse'],
      ['width', '100%'],
    ]);
    const { outer, insideHorizontal, insideVertical } = style.border ?? {};
    const outerBorder = outer === undefined ? undefined : border(outer.widthPt, outer.color);
    if (outerBorder !== undefined) whole.set('border', outerBorder);
    rules.push(this.rule([table], whole));

    const horizontal =
      insideHorizontal === undefined
        ? undefined
        : border(insideHorizontal.widthPt, insideHorizontal.color);
    if (horizontal !== undefined) {
      rules.push(this.rule([`${table} tr + tr > *`], new Map([['border-top', horizontal]])));
    }
    const vertical =
      insideVertical === undefined
        ? undefined
        : border(insideVertical.widthPt, insideVertical.color);
    if (vertical !== undefined) {
      rules.push(this.rule([`${table} tr > * + *`], new Map([['border-left', vertical]])));
    }

    const cells: Declarations = new Map([
      ['padding', pt(style.cellPaddingPt ?? 0)],
      ['text-align', 'left'],
      ['vertical-align', 'top'],
    ]);
    rules.push(this.rule([`${table} th`, `${table} td`], cells));

    // A browser makes header cells bold and centred, which only the style may do.
    const header: Declarations = new Map([['font-weight', '400']]);
    if (style.headerRow !== undefined) {
      this.text(style.headerRow.text, header);
      const background =
        style.headerRow.background === undefined
          ? undefined
          : this.color(style.headerRow.background);
      if (background !== undefined) header.set('background-color', background);
    }
    rules.push(this.rule([`${table} th`], header));
    return rules;
  }

  compile(): string {
    const root = [...PAPER].map(([name, value]) => `  ${name}: ${value};`).join('\n');
    const rules: string[] = [
      `.${this.scope} {\n${root}\n}`,
      this.rule(
        [`.${LIST_CLASS}`],
        new Map([
          ['margin', '0'],
          ['padding', '0'],
        ]),
      ),
    ];
    for (const name of this.stylesheet.paragraphStyles.keys())
      rules.push(...this.paragraphRules(name));
    for (const name of this.stylesheet.characterStyles.keys())
      rules.push(...this.characterRule(name));
    for (const name of this.stylesheet.tableStyles.keys()) rules.push(...this.tableRules(name));
    return `${rules.join('\n\n')}\n`;
  }
}

/**
 * Compiles a validated stylesheet to CSS for the editor (ADR 0021). Every rule is scoped to one
 * root class and written against the class names of `class-names.ts`. The result is a pure
 * function of the stylesheet, so the same input gives the same text.
 */
export function compileStylesheetToCss(
  stylesheet: Stylesheet,
  options: CssOptions = {},
): CssResult {
  const scope = options.scopeClass ?? SCOPE_CLASS;
  if (!CLASS_NAME.test(scope)) {
    return {
      css: undefined,
      diagnostics: [
        {
          severity: 'error',
          code: 'invalid-scope-class',
          message: `The scope "${scope}" is not a class name.`,
        },
      ],
    };
  }
  const diagnostics = validateStylesheet(stylesheet);
  if (hasErrors(diagnostics)) return { css: undefined, diagnostics };
  return { css: new Compiler(stylesheet, scope).compile(), diagnostics };
}
