import { strFromU8, unzipSync } from 'fflate';
import {
  readImageInfo,
  type Alignment,
  type CoverArea,
  type CoverColumnWidth,
  type CoverEntry,
  type CoverGrid,
  type CoverRowHeight,
  type LineSpacing,
  type PageMargins,
  type PageSize,
  type SlotPart,
  type StyleName,
} from '@stanza/core';
import { childOf, elementsOf, parseXml, type XmlElement } from './xml.js';

/**
 * The import of the cover of a Word template (ADR 0094): the first page, with the first-page header
 * and footer, as a cover grid with styles, tokens and images for the stylesheet of a project. Word
 * does not store where a paragraph lands, so heights are estimated from the styles.
 */

/** A paragraph style for the stylesheet, as the template shows it. Colors and fonts are tokens. */
export interface ImportedParagraphStyle {
  readonly name: string;
  readonly font?: string;
  readonly sizePt?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: string;
  readonly alignment?: Alignment;
  readonly spaceBeforePt?: number;
  readonly spaceAfterPt?: number;
  readonly lineSpacing?: LineSpacing;
  readonly indentLeftPt?: number;
}

export interface ImportedBorder {
  readonly widthPt: number;
  readonly color: string;
}

/** A table style for a cover table: its borders and the style of its cells. */
export interface ImportedTableStyle {
  readonly name: string;
  readonly cellStyle: string;
  readonly outer?: ImportedBorder;
  readonly insideHorizontal?: ImportedBorder;
  readonly insideVertical?: ImportedBorder;
  readonly cellPaddingPt?: number;
}

export interface CoverTemplateImport {
  readonly name: string;
  /** The page of the body: its size and margins. */
  readonly size: PageSize;
  readonly margins: PageMargins;
  readonly cover: CoverGrid;
  readonly paragraphStyles: readonly ImportedParagraphStyle[];
  readonly tableStyles: readonly ImportedTableStyle[];
  /** New color tokens, by name, as `#RRGGBB`. */
  readonly colors: readonly (readonly [string, string])[];
  /** New font tokens, by name. */
  readonly fonts: readonly (readonly [string, readonly string[]])[];
  readonly images: readonly { readonly path: string; readonly bytes: Uint8Array }[];
  /** The custom fields that the cover shows, which the project file declares. */
  readonly fields: readonly string[];
  readonly converted: readonly string[];
  readonly approximated: readonly string[];
  readonly leftOut: readonly string[];
}

export type CoverTemplateResult =
  | { readonly ok: true; readonly result: CoverTemplateImport }
  | { readonly ok: false; readonly message: string };

export interface CoverTemplateOptions {
  /** The name of the page template, kebab-case; it also names the styles, tokens and images. */
  readonly name: string;
  /** Where the images go, relative to the project root, such as `assets/report`. */
  readonly assetsDirectory: string;
  /** The color tokens of the stylesheet, to reuse one of the same value. */
  readonly colors: ReadonlyMap<string, string>;
  /** The font tokens of the stylesheet, to reuse one of the same family. */
  readonly fonts: ReadonlyMap<string, readonly string[]>;
}

const MAX_PART_BYTES = 64 * 1024 * 1024;
const RELATIONSHIP_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

const twipsToPt = (value: string | undefined): number | undefined =>
  value === undefined || !/^-?\d+$/.test(value) ? undefined : Number(value) / 20;

const round = (value: number): number => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------------------------
// The package

interface Part {
  readonly xml: XmlElement;
  /** Relationship targets by ID, as paths in the package. */
  readonly relationships: ReadonlyMap<string, { readonly type: string; readonly path: string }>;
}

function resolveTarget(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const step of target.split('/')) {
    if (step === '..') parts.pop();
    else if (step !== '.' && step !== '') parts.push(step);
  }
  return parts.join('/');
}

class TemplatePackage {
  constructor(private readonly files: Readonly<Record<string, Uint8Array>>) {}

  bytes(path: string): Uint8Array | undefined {
    return this.files[path];
  }

  part(path: string): Part | undefined {
    const data = this.files[path];
    if (data === undefined) return undefined;
    const slash = path.lastIndexOf('/');
    const relsPath = `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`;
    const relationships = new Map<string, { type: string; path: string }>();
    const rels = this.files[relsPath];
    if (rels !== undefined) {
      for (const entry of elementsOf(parseXml(strFromU8(rels)), 'Relationship')) {
        const id = entry.attrs['Id'];
        const target = entry.attrs['Target'];
        if (id === undefined || target === undefined || entry.attrs['TargetMode'] === 'External') {
          continue;
        }
        relationships.set(id, {
          type: entry.attrs['Type'] ?? '',
          path: resolveTarget(path, target),
        });
      }
    }
    return { xml: parseXml(strFromU8(data)), relationships };
  }
}

// ---------------------------------------------------------------------------------------------
// The look of a paragraph

interface Look {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  alignment?: Alignment;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineSpacing?: LineSpacing;
  indentLeftPt?: number;
}

interface Border {
  readonly side: string;
  readonly widthPt: number;
  readonly color: string;
}

/** The vertical place of a frame (ADR 0094): at a distance, or aligned, from the page or margins. */
interface Frame {
  readonly key: string;
  readonly anchor: 'page' | 'margin' | 'text';
  readonly y?: number;
  readonly align?: string;
}

interface Theme {
  readonly fonts: { readonly major?: string; readonly minor?: string };
  readonly colors: ReadonlyMap<string, string>;
}

const THEME_COLOR_NAMES: Readonly<Record<string, string>> = {
  text1: 'dk1',
  dark1: 'dk1',
  background1: 'lt1',
  light1: 'lt1',
  text2: 'dk2',
  dark2: 'dk2',
  background2: 'lt2',
  light2: 'lt2',
  hyperlink: 'hlink',
  followedHyperlink: 'folHlink',
};

function readTheme(xml: XmlElement | undefined): Theme {
  const colors = new Map<string, string>();
  const fonts: { major?: string; minor?: string } = {};
  const visit = (element: XmlElement, parent: string | undefined): void => {
    if (element.name === 'latin' && (parent === 'majorFont' || parent === 'minorFont')) {
      const face = element.attrs['typeface'];
      if (face !== undefined && face !== '') {
        if (parent === 'majorFont') fonts.major = face;
        else fonts.minor = face;
      }
    }
    if (parent === 'clrScheme') {
      const value = elementsOf(element)
        .map((child) => child.attrs['lastClr'] ?? child.attrs['val'])
        .find((hex) => hex !== undefined && /^[0-9A-Fa-f]{6}$/.test(hex));
      if (value !== undefined) colors.set(element.name, value.toUpperCase());
    }
    for (const child of elementsOf(element)) visit(child, element.name);
  };
  if (xml !== undefined) visit(xml, undefined);
  return { fonts, colors };
}

const ALIGNMENTS: Readonly<Record<string, Alignment>> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify',
};

const toggle = (properties: XmlElement | undefined, name: string): boolean | undefined => {
  const element = childOf(properties, name);
  if (element === undefined) return undefined;
  const value = element.attrs['val']?.toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
};

class Looks {
  private readonly styles = new Map<string, XmlElement>();
  private readonly defaults: Look;

  constructor(
    styles: XmlElement | undefined,
    private readonly theme: Theme,
  ) {
    for (const style of elementsOf(styles, 'style')) {
      const id = style.attrs['styleId'];
      if (id !== undefined) this.styles.set(id, style);
    }
    const defaults = childOf(styles, 'docDefaults');
    this.defaults = this.apply(
      this.apply({}, childOf(childOf(defaults, 'rPrDefault'), 'rPr'), 'run'),
      childOf(childOf(defaults, 'pPrDefault'), 'pPr'),
      'paragraph',
    );
  }

  /** The default paragraph style, which a paragraph without a style has. */
  private defaultParagraphStyle(): string | undefined {
    for (const [id, style] of this.styles) {
      if (style.attrs['type'] === 'paragraph' && style.attrs['default'] === '1') return id;
    }
    return undefined;
  }

  private font(fonts: XmlElement | undefined): string | undefined {
    if (fonts === undefined) return undefined;
    const direct = fonts.attrs['ascii'] ?? fonts.attrs['hAnsi'];
    if (direct !== undefined) return direct;
    const themed = fonts.attrs['asciiTheme'] ?? fonts.attrs['hAnsiTheme'];
    if (themed === undefined) return undefined;
    return themed.startsWith('major') ? this.theme.fonts.major : this.theme.fonts.minor;
  }

  private color(color: XmlElement | undefined): string | undefined {
    if (color === undefined) return undefined;
    const themed = color.attrs['themeColor'];
    if (themed !== undefined) {
      return this.theme.colors.get(THEME_COLOR_NAMES[themed] ?? themed);
    }
    // A run gives its color in `val`; a border gives its style there and its color in `color`.
    const value = color.name === 'color' ? color.attrs['val'] : color.attrs['color'];
    return value !== undefined && /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : undefined;
  }

  private apply(look: Look, properties: XmlElement | undefined, kind: 'run' | 'paragraph'): Look {
    if (properties === undefined) return look;
    const next: Look = { ...look };
    if (kind === 'run') {
      const font = this.font(childOf(properties, 'rFonts'));
      if (font !== undefined) next.font = font;
      const size = childOf(properties, 'sz')?.attrs['val'];
      if (size !== undefined && /^\d+$/.test(size)) next.sizePt = Number(size) / 2;
      const bold = toggle(properties, 'b');
      if (bold !== undefined) next.bold = bold;
      const italic = toggle(properties, 'i');
      if (italic !== undefined) next.italic = italic;
      const color = this.color(childOf(properties, 'color'));
      if (color !== undefined) next.color = color;
      return next;
    }
    const alignment = ALIGNMENTS[childOf(properties, 'jc')?.attrs['val'] ?? ''];
    if (alignment !== undefined) next.alignment = alignment;
    const spacing = childOf(properties, 'spacing');
    const before = twipsToPt(spacing?.attrs['before']);
    if (before !== undefined) next.spaceBeforePt = before;
    const after = twipsToPt(spacing?.attrs['after']);
    if (after !== undefined) next.spaceAfterPt = after;
    const line = spacing?.attrs['line'];
    if (line !== undefined && /^\d+$/.test(line)) {
      const rule = spacing?.attrs['lineRule'] ?? 'auto';
      next.lineSpacing =
        rule === 'exact'
          ? { rule: 'exactly', pt: Number(line) / 20 }
          : rule === 'atLeast'
            ? { rule: 'at-least', pt: Number(line) / 20 }
            : { rule: 'multiple', factor: round(Number(line) / 240) };
    }
    const indent = childOf(properties, 'ind');
    const left = twipsToPt(indent?.attrs['left'] ?? indent?.attrs['start']);
    if (left !== undefined) next.indentLeftPt = left;
    // The run properties inside `pPr` format the paragraph mark only, not the text.
    return next;
  }

  /** The look of a style, with the styles it is based on. */
  private styleLook(id: string | undefined, seen = new Set<string>()): Look {
    const style = id === undefined ? undefined : this.styles.get(id);
    if (id === undefined || style === undefined || seen.has(id)) return this.defaults;
    seen.add(id);
    const base = this.styleLook(childOf(style, 'basedOn')?.attrs['val'], seen);
    return this.apply(
      this.apply(base, childOf(style, 'pPr'), 'paragraph'),
      childOf(style, 'rPr'),
      'run',
    );
  }

  /** The style of a paragraph, the default one when it has none. */
  styleOf(paragraph: XmlElement): string | undefined {
    return (
      childOf(childOf(paragraph, 'pPr'), 'pStyle')?.attrs['val'] ?? this.defaultParagraphStyle()
    );
  }

  /** How a paragraph looks: its style, its own properties, and those of its first run with text. */
  lookOf(paragraph: XmlElement): Look {
    const pPr = childOf(paragraph, 'pPr');
    const own = this.apply(this.styleLook(this.styleOf(paragraph)), pPr, 'paragraph');
    const run = runsOf(paragraph).find((candidate) => textOfRun(candidate) !== '');
    return this.apply(own, childOf(run, 'rPr'), 'run');
  }

  /** The styles of a paragraph from the root of its chain to its own. */
  private chainOf(paragraph: XmlElement): XmlElement[] {
    const chain: XmlElement[] = [];
    let id = this.styleOf(paragraph);
    const seen = new Set<string>();
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const style = this.styles.get(id);
      if (style === undefined) break;
      chain.unshift(style);
      id = childOf(style, 'basedOn')?.attrs['val'];
    }
    return chain;
  }

  /**
   * Where a frame puts a paragraph, from the frame properties of its styles and its own, which add to
   * them. A frame without a vertical position leaves the paragraph in the flow.
   */
  frameOf(paragraph: XmlElement): Frame | undefined {
    const attrs: Record<string, string> = {};
    for (const properties of [
      ...this.chainOf(paragraph).map((style) => childOf(style, 'pPr')),
      childOf(paragraph, 'pPr'),
    ]) {
      Object.assign(attrs, childOf(properties, 'framePr')?.attrs ?? {});
    }
    const y = twipsToPt(attrs['y']);
    const align = attrs['yAlign'];
    if (y === undefined && align === undefined) return undefined;
    const anchor =
      attrs['vAnchor'] === 'page' || attrs['vAnchor'] === 'text' ? attrs['vAnchor'] : 'margin';
    return {
      key: JSON.stringify([anchor, y, align]),
      anchor,
      ...(y !== undefined ? { y } : {}),
      ...(align !== undefined ? { align } : {}),
    };
  }

  /** The kinds of the tab stops of a paragraph, from its styles and its own properties. */
  tabStopsOf(paragraph: XmlElement): string[] {
    const stops: string[] = [];
    for (const properties of [
      ...this.chainOf(paragraph).map((style) => childOf(style, 'pPr')),
      childOf(paragraph, 'pPr'),
    ]) {
      for (const tab of elementsOf(childOf(properties, 'tabs'), 'tab')) {
        const kind = tab.attrs['val'];
        // A stop at the start of the line is not where a first tab goes.
        if (Number(tab.attrs['pos'] ?? '1') <= 0) continue;
        if (kind !== undefined && kind !== 'clear') stops.push(kind);
      }
    }
    return stops;
  }

  /** The border of a side of a paragraph, from its style and its own properties. */
  bordersOf(paragraph: XmlElement): Border[] {
    const chain: XmlElement[] = [];
    let id = this.styleOf(paragraph);
    const seen = new Set<string>();
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const style = this.styles.get(id);
      if (style === undefined) break;
      chain.unshift(style);
      id = childOf(style, 'basedOn')?.attrs['val'];
    }
    const borders = new Map<string, Border>();
    for (const properties of [
      ...chain.map((style) => childOf(style, 'pPr')),
      childOf(paragraph, 'pPr'),
    ]) {
      for (const side of elementsOf(childOf(properties, 'pBdr'))) {
        const value = side.attrs['val'];
        if (value === undefined || value === 'none' || value === 'nil') {
          borders.delete(side.name);
          continue;
        }
        borders.set(side.name, {
          side: side.name,
          widthPt: Number(side.attrs['sz'] ?? '4') / 8,
          color: this.color(side) ?? '000000',
        });
      }
    }
    return [...borders.values()];
  }
}

// ---------------------------------------------------------------------------------------------
// The text of a paragraph

const runsOf = (paragraph: XmlElement): XmlElement[] => {
  const runs: XmlElement[] = [];
  const visit = (element: XmlElement): void => {
    for (const child of elementsOf(element)) {
      if (child.name === 'r') runs.push(child);
      else if (child.name !== 'pPr' && child.name !== 'txbxContent') visit(child);
    }
  };
  visit(paragraph);
  return runs;
};

function textOfRun(run: XmlElement): string {
  let text = '';
  for (const child of elementsOf(run)) {
    if (child.name === 't')
      text += child.children.filter((node) => typeof node === 'string').join('');
    else if (child.name === 'tab') text += ' ';
    else if (child.name === 'br' || child.name === 'cr') text += '\n';
  }
  return text;
}

/** The names of placeholders that become the built-in tokens, in lower case without spaces. */
const TOKEN_PLACEHOLDERS: Readonly<
  Record<string, 'title' | 'authors' | 'classification' | 'version'>
> = {
  title: 'title',
  documenttitle: 'title',
  author: 'authors',
  authors: 'authors',
  'author(s)': 'authors',
  authorname: 'authors',
  authornames: 'authors',
  'authorname(s)': 'authors',
  classification: 'classification',
  version: 'version',
};

/** The document properties that content controls bind to, and their tokens or fields. */
const BOUND_PROPERTIES: Readonly<Record<string, string>> = {
  title: 'title',
  creator: 'authors',
  subject: 'field:subtitle',
};

const kebab = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * The token or field of a `[Placeholder]`. Its label is the text inside the brackets, shown while
 * the value is missing; a label cannot hold the brackets of the link it is written in.
 */
function placeholderPart(placeholder: string, fields: Set<string>): SlotPart {
  const label = placeholder.slice(1, -1).trim();
  const token = TOKEN_PLACEHOLDERS[label.toLowerCase().replace(/\s+/g, '')];
  if (token !== undefined) return { kind: 'token', token, label };
  let name = kebab(label);
  if (name === '' || !/^[a-z]/.test(name)) name = `field-${name}`.replace(/-+$/, '');
  fields.add(name);
  return { kind: 'field', name, label };
}

/** Text with `[Placeholders]` turned into tokens and fields (ADR 0094). */
function slotParts(text: string, fields: Set<string>): SlotPart[] {
  const parts: SlotPart[] = [];
  let from = 0;
  for (const match of text.matchAll(/\[[^\][\n]+\]/g)) {
    if (match.index > from) parts.push({ kind: 'text', text: text.slice(from, match.index) });
    parts.push(placeholderPart(match[0], fields));
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ kind: 'text', text: text.slice(from) });
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Blocks of the first page

interface PictureRef {
  readonly id: string;
  readonly widthPt: number;
  readonly heightPt: number;
}

type Block =
  | {
      readonly kind: 'paragraph';
      readonly look: Look;
      readonly style: string | undefined;
      readonly lines: readonly SlotPart[][];
      readonly pictures: readonly PictureRef[];
      readonly borders: readonly Border[];
      readonly heightPt: number;
      readonly pageBreak: boolean;
      readonly sectionBreak: boolean;
      readonly frame?: Frame;
    }
  | {
      readonly kind: 'table';
      readonly table: XmlElement;
      readonly heightPt: number;
      /** The part that holds the table, for the pictures in its cells. */
      readonly part: Part;
    };

/** The elements of a name below one, without the fallback copy of alternate content. */
const descendants = (element: XmlElement, name: string): XmlElement[] => {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement): void => {
    for (const child of elementsOf(node)) {
      if (child.name === 'Fallback') continue;
      if (child.name === name) found.push(child);
      visit(child);
    }
  };
  visit(element);
  return found;
};

/** What holds content of its own, outside the text of the paragraph it is anchored in. */
const OWN_CONTENT = new Set([
  'pPr',
  'drawing',
  'pict',
  'AlternateContent',
  'txbxContent',
  'object',
]);

function lineHeightPt(look: Look): number {
  const size = look.sizePt ?? 11;
  const spacing = look.lineSpacing;
  if (spacing?.rule === 'exactly') return spacing.pt;
  if (spacing?.rule === 'at-least') return Math.max(spacing.pt, size * 1.2);
  return size * 1.2 * (spacing?.rule === 'multiple' ? spacing.factor : 1);
}

class Reader {
  readonly fields = new Set<string>();
  readonly converted: string[] = [];
  readonly approximated: string[] = [];
  readonly leftOut: string[] = [];

  constructor(readonly looks: Looks) {}

  paragraph(element: XmlElement, part: Part, alignment?: Alignment): Block[] {
    let look = this.looks.lookOf(element);
    // A paragraph that starts with a tab to a centre or right tab stop is aligned there.
    const content = (run: XmlElement): XmlElement[] =>
      elementsOf(run).filter((child) => ['t', 'tab', 'br', 'cr'].includes(child.name));
    const first = runsOf(element).find((run) => content(run).length > 0);
    if (first !== undefined && content(first)[0]?.name === 'tab') {
      const stop = this.looks.tabStopsOf(element)[0];
      if (stop === 'center') look = { ...look, alignment: 'center' };
      else if (stop === 'right' || stop === 'end') look = { ...look, alignment: 'right' };
    }
    if (alignment !== undefined) look = { ...look, alignment };
    const extra: Block[] = [];
    // A content control bound to a document property is that property.
    let text = '';
    const visit = (node: XmlElement): void => {
      for (const child of elementsOf(node)) {
        if (child.name === 'sdt') {
          const binding = childOf(childOf(child, 'sdtPr'), 'dataBinding')?.attrs['xpath'];
          const property = binding === undefined ? undefined : /(\w+)\[1\]\s*$/.exec(binding)?.[1];
          if (property !== undefined) {
            const shown = runsOf(child).map(textOfRun).join('') || property;
            const token = BOUND_PROPERTIES[property];
            if (token === undefined || token.startsWith('field:')) {
              const field = token === undefined ? kebab(property) : token.slice('field:'.length);
              text += `\uE001${field}\uE002${shown}\uE003`;
            } else {
              text += `\uE004${token}\uE002${shown}\uE003`;
            }
            continue;
          }
          visit(childOf(child, 'sdtContent') ?? child);
          continue;
        }
        if (child.name === 'r') {
          text += textOfRun(child);
          continue;
        }
        if (OWN_CONTENT.has(child.name)) continue;
        visit(child);
      }
    };
    visit(element);
    const pictures: PictureRef[] = [];
    for (const drawing of descendants(element, 'drawing')) {
      const holder = childOf(drawing, 'inline') ?? childOf(drawing, 'anchor');
      if (holder?.name === 'anchor')
        this.approximated.push('A picture anchored to the page is placed in the flow.');
      const blip = descendants(drawing, 'blip')[0];
      const extent = childOf(holder, 'extent');
      const id = blip?.attrs['embed'];
      if (id === undefined || extent === undefined) continue;
      const target = part.relationships.get(id);
      if (target === undefined) continue;
      pictures.push({
        id: target.path,
        widthPt: round(Number(extent.attrs['cx'] ?? '0') / 12700),
        heightPt: round(Number(extent.attrs['cy'] ?? '0') / 12700),
      });
    }
    for (const drawing of descendants(element, 'drawing')) {
      // A text box at the right of the page, or in its centre, keeps that side.
      const anchor = childOf(drawing, 'anchor');
      const side =
        childOf(childOf(childOf(anchor, 'positionH'), 'align'), 'align') ??
        childOf(childOf(anchor, 'positionH'), 'align');
      const placed = side?.children
        .filter((node) => typeof node === 'string')
        .join('')
        .trim();
      const boxAlignment: Alignment | undefined =
        placed === 'right' || placed === 'outside'
          ? 'right'
          : placed === 'center'
            ? 'center'
            : undefined;
      // A text box that a sensitivity label put there holds the classification of the document.
      const labelled = descendants(drawing, 'classification').length > 0;
      for (const box of descendants(drawing, 'txbxContent')) {
        this.approximated.push('A text box is placed in the flow, where it is anchored.');
        for (const inner of elementsOf(box, 'p')) {
          for (const block of this.paragraph(inner, part, boxAlignment)) {
            if (!labelled || block.kind !== 'paragraph') {
              extra.push(block);
              continue;
            }
            const label = block.lines
              .flat()
              .map((part) => (part.kind === 'text' ? part.text : part.label))
              .join('')
              .trim();
            if (label === '') continue;
            extra.push({ ...block, lines: [[{ kind: 'token', token: 'classification', label }]] });
            this.converted.push(
              'The classification of a sensitivity label as the classification token.',
            );
          }
        }
      }
    }
    if (descendants(element, 'pict').length > 0 && pictures.length === 0) {
      this.leftOut.push('A VML picture or shape (w:pict) is left out.');
    }
    const lines = text.split('\n').map((line) => this.lineParts(line));
    const visibleLines = lines.filter((line) => line.length > 0).length;
    const textHeight = Math.max(visibleLines, 1) * lineHeightPt(look);
    const picturesHeight = pictures.reduce((sum, picture) => Math.max(sum, picture.heightPt), 0);
    const heightPt =
      (look.spaceBeforePt ?? 0) + Math.max(textHeight, picturesHeight) + (look.spaceAfterPt ?? 0);
    const pPr = childOf(element, 'pPr');
    const frame = this.looks.frameOf(element);
    const block: Block = {
      kind: 'paragraph',
      look,
      style: this.looks.styleOf(element),
      lines,
      pictures,
      borders: this.looks.bordersOf(element),
      heightPt,
      pageBreak:
        descendants(element, 'br').some((br) => br.attrs['type'] === 'page') ||
        childOf(pPr, 'pageBreakBefore') !== undefined,
      sectionBreak: childOf(pPr, 'sectPr') !== undefined,
      ...(frame !== undefined ? { frame } : {}),
    };
    return [block, ...extra];
  }

  /** A line of text with placeholders and bound properties as parts. */
  private lineParts(line: string): SlotPart[] {
    const parts: SlotPart[] = [];
    let rest = line;
    while (rest !== '') {
      const at = rest.search(/[\uE001\uE004]/);
      const plain = at < 0 ? rest : rest.slice(0, at);
      parts.push(...slotParts(plain, this.fields));
      if (at < 0) break;
      const close = rest.indexOf('\uE003', at);
      const [name = '', label = ''] = rest.slice(at + 1, close).split('\uE002');
      if (rest[at] === '\uE004') {
        parts.push({ kind: 'token', token: name as 'title' | 'authors', label });
      } else {
        this.fields.add(name);
        parts.push({ kind: 'field', name, label });
      }
      rest = rest.slice(close + 1);
    }
    // Tabs and spaces at the ends of a line place it; the alignment of its style does that here.
    const first = parts[0];
    if (first?.kind === 'text') parts[0] = { kind: 'text', text: first.text.trimStart() };
    const last = parts.at(-1);
    if (last?.kind === 'text')
      parts[parts.length - 1] = { kind: 'text', text: last.text.trimEnd() };
    return parts.filter((part) => part.kind !== 'text' || part.text !== '');
  }

  table(element: XmlElement, part: Part): Block {
    let height = 0;
    for (const row of elementsOf(element, 'tr')) {
      const fixed = twipsToPt(childOf(childOf(row, 'trPr'), 'trHeight')?.attrs['val']);
      const cells = elementsOf(row, 'tc').map((cell) =>
        elementsOf(cell, 'p').reduce((sum, paragraph) => {
          const block = this.paragraph(paragraph, part)[0];
          return sum + (block?.heightPt ?? 0);
        }, 0),
      );
      height += Math.max(fixed ?? 0, ...cells, 0) + 2;
    }
    return { kind: 'table', table: element, heightPt: height, part };
  }

  /** The blocks of a body or a header or footer, up to the end of the first page of a body. */
  blocks(container: XmlElement, part: Part, firstPage: boolean): Block[] {
    const blocks: Block[] = [];
    for (const child of elementsOf(container)) {
      if (child.name === 'p') {
        const read = this.paragraph(child, part);
        blocks.push(...read);
        const first = read[0];
        if (firstPage && first?.kind === 'paragraph' && (first.pageBreak || first.sectionBreak))
          break;
      } else if (child.name === 'tbl') {
        blocks.push(this.table(child, part));
      } else if (child.name === 'sdt') {
        blocks.push(...this.blocks(childOf(child, 'sdtContent') ?? child, part, firstPage));
      }
    }
    return blocks;
  }
}

// ---------------------------------------------------------------------------------------------
// The import

const hasVisibleBorders = (table: XmlElement): boolean => {
  const sides = [
    ...elementsOf(childOf(childOf(table, 'tblPr'), 'tblBorders')),
    ...descendants(table, 'tcBorders').flatMap((borders) => elementsOf(borders)),
  ];
  return sides.some((side) => {
    const value = side.attrs['val'];
    return value !== undefined && value !== 'none' && value !== 'nil';
  });
};

const PAGE_SIZES_TWIPS: readonly [PageSize, number, number][] = [
  ['A4', 11906, 16838],
  ['Letter', 12240, 15840],
];

/** Reads a Word template and makes the cover of its first page (ADR 0094). */
export function importCoverTemplate(
  bytes: Uint8Array,
  options: CoverTemplateOptions,
): CoverTemplateResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.originalSize <= MAX_PART_BYTES });
  } catch {
    return {
      ok: false,
      message: 'This is not a Word file: it is not a ZIP package, or it is damaged.',
    };
  }
  const pkg = new TemplatePackage(files);
  const documentPath = files['word/document.xml'] !== undefined ? 'word/document.xml' : undefined;
  const document = documentPath === undefined ? undefined : pkg.part(documentPath);
  const body = childOf(document?.xml, 'body');
  if (document === undefined || body === undefined) {
    return { ok: false, message: 'This file has no Word document in it.' };
  }
  const partOfType = (type: string): Part | undefined => {
    const entry = [...document.relationships.values()].find(
      (r) => r.type === `${RELATIONSHIP_BASE}${type}`,
    );
    return entry === undefined ? undefined : pkg.part(entry.path);
  };
  const theme = readTheme(partOfType('theme')?.xml);
  const looks = new Looks(partOfType('styles')?.xml, theme);
  const reader = new Reader(looks);
  const converted: string[] = [];
  const { name } = options;

  // The section of the first page: the first section break, or the one at the end of the body.
  const sectionBreak = descendants(body, 'pPr')
    .map((pPr) => childOf(pPr, 'sectPr'))
    .find((s) => s !== undefined);
  const section = sectionBreak ?? childOf(body, 'sectPr');
  const pageSize = childOf(section, 'pgSz');
  const margin = childOf(section, 'pgMar');
  const width = Number(pageSize?.attrs['w'] ?? '11906');
  const height = Number(pageSize?.attrs['h'] ?? '16838');
  const [size] = [...PAGE_SIZES_TWIPS].sort(
    (a, b) =>
      Math.abs(a[1] - width) +
      Math.abs(a[2] - height) -
      (Math.abs(b[1] - width) + Math.abs(b[2] - height)),
  )[0] ?? ['A4'];
  const sizeTwips = PAGE_SIZES_TWIPS.find(([candidate]) => candidate === size);
  if (
    sizeTwips !== undefined &&
    (Math.abs(sizeTwips[1] - width) > 240 || Math.abs(sizeTwips[2] - height) > 240)
  ) {
    reader.approximated.push(
      `The page of ${String(width / 20)} by ${String(height / 20)} pt is made ${size}.`,
    );
  }
  const margins: PageMargins = {
    topPt: twipsToPt(margin?.attrs['top']) ?? 72,
    rightPt: twipsToPt(margin?.attrs['right']) ?? 72,
    bottomPt: twipsToPt(margin?.attrs['bottom']) ?? 72,
    leftPt: twipsToPt(margin?.attrs['left']) ?? 72,
  };
  const headerDistance = twipsToPt(margin?.attrs['header']) ?? 35.4;
  const footerDistance = twipsToPt(margin?.attrs['footer']) ?? 35.4;
  converted.push(
    `The page: ${size}, margins ${[margins.topPt, margins.rightPt, margins.bottomPt, margins.leftPt].join(', ')} pt.`,
  );

  // The header and the footer of the first page.
  const firstPageOnly = childOf(section, 'titlePg') !== undefined;
  const referenced = (kind: 'header' | 'footer'): Part | undefined => {
    const references = elementsOf(section, `${kind}Reference`);
    const reference =
      references.find((r) => r.attrs['type'] === (firstPageOnly ? 'first' : 'default')) ??
      (firstPageOnly ? undefined : references[0]);
    const id = reference?.attrs['id'];
    const target = id === undefined ? undefined : document.relationships.get(id);
    return target === undefined ? undefined : pkg.part(target.path);
  };
  const header = referenced('header');
  const footer = referenced('footer');
  const headerBlocks = header === undefined ? [] : reader.blocks(header.xml, header, false);
  const bodyBlocks = reader.blocks(body, document, true);
  const footerBlocks = footer === undefined ? [] : reader.blocks(footer.xml, footer, false);
  if (header !== undefined)
    converted.push('The header of the first page, at the top of the cover.');
  if (footer !== undefined)
    converted.push('The footer of the first page, at the bottom of the cover.');
  reader.leftOut.push('The headers and footers of the body pages are not imported (item 216).');

  const coverWidthPt = width / 20 - margins.leftPt - margins.rightPt;
  const pageHeight = height / 20;
  const build = new GridBuilder(name, coverWidthPt, looks, reader, options, pkg);
  // Each part of the page with where its top is, in points from the top of the page.
  const pieces: Piece[] = [];
  if (header !== undefined) pieces.push({ top: headerDistance, ...build.capture(headerBlocks) });
  let flow = Math.max(margins.topPt, (pieces[0]?.top ?? 0) + (pieces[0]?.height ?? 0));
  for (const group of groupByFrame(bodyBlocks)) {
    const captured = build.capture(group.blocks);
    const frame = group.frame;
    if (frame === undefined) {
      pieces.push({ top: flow, ...captured });
      flow += captured.height;
      continue;
    }
    const [from, to] =
      frame.anchor === 'page' ? [0, pageHeight] : [margins.topPt, pageHeight - margins.bottomPt];
    const top =
      frame.y !== undefined
        ? (frame.anchor === 'text' ? flow : from) + frame.y
        : frame.align === 'bottom' || frame.align === 'outside'
          ? to - captured.height
          : frame.align === 'center'
            ? from + (to - from - captured.height) / 2
            : from;
    pieces.push({ top, ...captured });
    converted.push('A frame at its place on the page.');
  }
  const footerPiece = footer === undefined ? undefined : build.capture(footerBlocks);
  build.place(pieces, header === undefined ? margins.topPt : headerDistance, footerPiece);

  const coverMargins: Partial<PageMargins> = {
    topPt: header === undefined ? margins.topPt : headerDistance,
    bottomPt: footer === undefined ? margins.bottomPt : footerDistance,
  };
  const cover = build.grid(
    coverMargins,
    height / 20 - (coverMargins.topPt ?? 0) - (coverMargins.bottomPt ?? 0),
  );
  converted.push(
    `The cover: ${String(cover.columns.length)} columns and ${String(cover.rows.length)} rows, with heights estimated from the styles.`,
  );
  return {
    ok: true,
    result: {
      name,
      size,
      margins,
      cover,
      paragraphStyles: build.paragraphStyles(),
      tableStyles: build.tableStyles,
      colors: build.newColors,
      fonts: build.newFonts,
      images: build.images,
      fields: [...reader.fields].sort(),
      converted: [...converted, ...build.converted, ...new Set(reader.converted)],
      approximated: [...new Set(reader.approximated)],
      leftOut: [...new Set(reader.leftOut)],
    },
  };
}

/** A part of the page: its rows, how high they are together, and where its top is. */
interface Piece {
  readonly top: number;
  readonly rows: GridRow[];
  readonly height: number;
}

/**
 * The blocks in groups: those of one frame, with a table between two of its paragraphs, and those
 * in the flow between them.
 */
function groupByFrame(blocks: readonly Block[]): { frame?: Frame; blocks: Block[] }[] {
  const frameOf = (block: Block | undefined): Frame | undefined =>
    block?.kind === 'paragraph' ? block.frame : undefined;
  const groups: { frame?: Frame; blocks: Block[] }[] = [];
  blocks.forEach((block, index) => {
    let frame = frameOf(block);
    if (block.kind === 'table') {
      const before = frameOf(blocks[index - 1]);
      const after = frameOf(blocks[index + 1]);
      if (before !== undefined && before.key === after?.key) frame = before;
    }
    const last = groups.at(-1);
    if (last !== undefined && last.frame?.key === frame?.key) last.blocks.push(block);
    else groups.push({ ...(frame !== undefined ? { frame } : {}), blocks: [block] });
  });
  return groups;
}

interface GridRow {
  heightPt: number;
  /** The areas of the row by their column range; one spanning all columns for most rows. */
  readonly cells: { readonly from: number; readonly to: number; readonly area?: CoverArea }[];
  /** The boundaries of its columns in points from the left, for a row of a layout table. */
  readonly boundaries?: readonly number[];
  readonly share?: boolean;
}

class GridBuilder {
  private readonly rows: GridRow[] = [];
  private readonly styles = new Map<string, { style: ImportedParagraphStyle; key: string }>();
  readonly tableStyles: ImportedTableStyle[] = [];
  readonly newColors: [string, string][] = [];
  readonly newFonts: [string, readonly string[]][] = [];
  readonly images: { path: string; bytes: Uint8Array }[] = [];
  readonly converted: string[] = [];
  private readonly imagePaths = new Map<string, string>();

  constructor(
    private readonly name: string,
    private readonly widthPt: number,
    private readonly looks: Looks,
    private readonly reader: Reader,
    private readonly options: CoverTemplateOptions,
    private readonly pkg: TemplatePackage,
  ) {}

  private colorToken(hex: string): string {
    const value = `#${hex.toUpperCase()}`;
    const existing = [...this.options.colors].find(
      ([, known]) => known.toUpperCase() === value,
    )?.[0];
    if (existing !== undefined) return existing;
    const made = this.newColors.find(([, known]) => known === value)?.[0];
    if (made !== undefined) return made;
    const token = `${this.name}-color-${String(this.newColors.length + 1)}`;
    this.newColors.push([token, value]);
    return token;
  }

  private fontToken(family: string): string {
    const existing = [...this.options.fonts].find(([, families]) => families[0] === family)?.[0];
    if (existing !== undefined) return existing;
    const made = this.newFonts.find(([, families]) => families[0] === family)?.[0];
    if (made !== undefined) return made;
    const token = `${this.name}-font-${String(this.newFonts.length + 1)}`;
    this.newFonts.push([token, [family]]);
    return token;
  }

  /** A paragraph style for a look; paragraphs that look the same share one. */
  styleFor(look: Look, wordStyle: string | undefined): StyleName {
    const style: Omit<ImportedParagraphStyle, 'name'> = {
      ...(look.font !== undefined ? { font: this.fontToken(look.font) } : {}),
      ...(look.sizePt !== undefined ? { sizePt: look.sizePt } : {}),
      ...(look.bold === true ? { bold: true } : {}),
      ...(look.italic === true ? { italic: true } : {}),
      ...(look.color !== undefined ? { color: this.colorToken(look.color) } : {}),
      ...(look.alignment !== undefined && look.alignment !== 'left'
        ? { alignment: look.alignment }
        : {}),
      spaceBeforePt: look.spaceBeforePt ?? 0,
      spaceAfterPt: look.spaceAfterPt ?? 0,
      ...(look.lineSpacing !== undefined ? { lineSpacing: look.lineSpacing } : {}),
      ...(look.indentLeftPt !== undefined && look.indentLeftPt !== 0
        ? { indentLeftPt: look.indentLeftPt }
        : {}),
    };
    const key = JSON.stringify(style);
    const found = [...this.styles.values()].find((entry) => entry.key === key);
    if (found !== undefined) return found.style.name as StyleName;
    const base = `${this.name}-${kebab(wordStyle ?? 'text') || 'text'}`;
    let named = base;
    for (let count = 2; this.styles.has(named); count += 1) named = `${base}-${String(count)}`;
    this.styles.set(named, { style: { name: named, ...style }, key });
    return named as StyleName;
  }

  paragraphStyles(): ImportedParagraphStyle[] {
    return [...this.styles.values()].map((entry) => entry.style);
  }

  private image(picture: PictureRef): CoverEntry | undefined {
    const bytes = this.pkg.bytes(picture.id);
    const info = bytes === undefined ? undefined : readImageInfo(bytes);
    if (bytes === undefined || info === undefined) {
      this.reader.leftOut.push(`The picture ${picture.id} is not a PNG or JPEG and is left out.`);
      return undefined;
    }
    let path = this.imagePaths.get(picture.id);
    if (path === undefined) {
      path = `${this.options.assetsDirectory}/image-${String(this.imagePaths.size + 1)}.${info.format === 'png' ? 'png' : 'jpg'}`;
      this.imagePaths.set(picture.id, path);
      this.images.push({ path, bytes });
      this.converted.push(`The picture ${picture.id} as ${path}.`);
    }
    return { kind: 'image', path, widthPt: picture.widthPt };
  }

  /** The entries of paragraphs: their lines in their style, and their pictures. */
  private entries(blocks: readonly (Block & { kind: 'paragraph' })[]): CoverEntry[] {
    const entries: CoverEntry[] = [];
    for (const block of blocks) {
      const style = this.styleFor(block.look, block.style);
      for (const picture of block.pictures) {
        const entry = this.image(picture);
        if (entry !== undefined) entries.push({ ...entry, style });
      }
      for (const line of block.lines) {
        if (line.length > 0) entries.push({ kind: 'paragraph', style, text: line });
      }
    }
    return entries;
  }

  private full(heightPt: number, area: CoverArea | undefined): void {
    this.rows.push({
      heightPt,
      cells: [{ from: 0, to: 1, ...(area !== undefined ? { area } : {}) }],
    });
  }

  spacer(heightPt: number): void {
    const last = this.rows.at(-1);
    if (
      last !== undefined &&
      last.share !== true &&
      last.boundaries === undefined &&
      last.cells[0]?.area === undefined
    ) {
      last.heightPt += heightPt;
      return;
    }
    this.full(heightPt, undefined);
  }

  /** The rows of blocks, built apart from the others, and their height together. */
  capture(blocks: readonly Block[]): { rows: GridRow[]; height: number } {
    const saved = this.rows.splice(0);
    this.add(blocks);
    const rows = this.rows.splice(0);
    this.rows.push(...saved);
    return { rows, height: rows.reduce((sum, row) => sum + row.heightPt, 0) };
  }

  /**
   * The parts in order from the top, with spacer rows between them, and the footer at the bottom
   * after a share row that takes what is left. A part that would overlap the one above follows it.
   */
  place(
    pieces: readonly Piece[],
    coverTop: number,
    footer: { rows: GridRow[]; height: number } | undefined,
  ): void {
    let cursor = coverTop;
    for (const piece of [...pieces].sort((a, b) => a.top - b.top)) {
      const gap = piece.top - cursor;
      if (gap > 0.5) this.spacer(gap);
      else if (gap < -1)
        this.reader.approximated.push('Parts that overlap on the page follow each other.');
      this.rows.push(...piece.rows);
      cursor = Math.max(cursor, piece.top) + piece.height;
    }
    this.share();
    if (footer !== undefined) this.rows.push(...footer.rows);
  }

  share(): void {
    this.rows.push({ heightPt: 0, cells: [{ from: 0, to: 1 }], share: true });
  }

  /** Adds the blocks as rows, and returns their height. */
  add(blocks: readonly Block[]): number {
    let total = 0;
    let text: (Block & { kind: 'paragraph' })[] = [];
    const flush = (): void => {
      if (text.length === 0) return;
      const heightPt = text.reduce((sum, block) => sum + block.heightPt, 0);
      this.full(heightPt, { valign: 'top', content: this.entries(text) });
      text = [];
    };
    for (const block of blocks) {
      total += block.heightPt;
      if (block.kind === 'table') {
        flush();
        this.addTable(block);
        continue;
      }
      const hasText = block.lines.some((line) => line.length > 0);
      if (hasText || block.pictures.length > 0) {
        text.push(block);
        continue;
      }
      flush();
      const rule = block.borders.find(
        (border) => border.side === 'bottom' || border.side === 'top',
      );
      if (rule !== undefined) {
        const space = Math.max(0, block.heightPt - rule.widthPt);
        if (rule.side === 'bottom' && space > 0) this.spacer(space);
        this.full(Math.max(0.5, rule.widthPt), {
          valign: 'top',
          background: { kind: 'token', name: this.colorToken(rule.color) },
          content: [],
        });
        if (rule.side === 'top' && space > 0) this.spacer(space);
        this.converted.push('A paragraph border as a rule: a thin row with a color.');
        continue;
      }
      if (block.borders.length > 0) {
        this.reader.approximated.push('A border around a paragraph is left out; the text stays.');
      }
      this.spacer(block.heightPt);
    }
    flush();
    for (const block of blocks) {
      if (
        block.kind === 'paragraph' &&
        block.borders.length > 0 &&
        block.lines.some((l) => l.length > 0)
      ) {
        this.reader.approximated.push('A border around a paragraph with text is left out.');
      }
    }
    return total;
  }

  private addTable(block: Block & { kind: 'table' }): void {
    const table = block.table;
    const grid = elementsOf(childOf(table, 'tblGrid'), 'gridCol').map(
      (column) => twipsToPt(column.attrs['w']) ?? 0,
    );
    const total = grid.reduce((sum, value) => sum + value, 0) || this.widthPt;
    const scale = Math.min(1, this.widthPt / total);
    const rows = elementsOf(table, 'tr');
    if (!hasVisibleBorders(table)) {
      // A layout table: its columns become columns of the grid.
      const boundaries = [0];
      for (const width of grid) boundaries.push((boundaries.at(-1) ?? 0) + width * scale);
      for (const row of rows) {
        let column = 0;
        const cells: { from: number; to: number; area?: CoverArea }[] = [];
        let height = 0;
        for (const cell of elementsOf(row, 'tc')) {
          const span = Number(childOf(childOf(cell, 'tcPr'), 'gridSpan')?.attrs['val'] ?? '1');
          const blocks = elementsOf(cell, 'p').flatMap((p) => this.reader.paragraph(p, block.part));
          const paragraphs = blocks.filter(
            (b): b is Block & { kind: 'paragraph' } => b.kind === 'paragraph',
          );
          height = Math.max(
            height,
            paragraphs.reduce((sum, b) => sum + b.heightPt, 0),
          );
          const content = this.entries(paragraphs);
          cells.push({
            from: column,
            to: column + span,
            ...(content.length > 0 ? { area: { valign: 'top', content } } : {}),
          });
          column += span;
        }
        this.rows.push({ heightPt: height, cells, boundaries });
      }
      this.converted.push(`A table without borders as ${String(grid.length)} columns of the grid.`);
      return;
    }
    // A table with borders: a cover table of labels and values.
    const tableRows: { label: string; value: SlotPart[] }[] = [];
    let cellLook: Look | undefined;
    let cellWordStyle: string | undefined;
    for (const row of rows) {
      const cells = elementsOf(row, 'tc');
      const texts = cells.map((cell) =>
        elementsOf(cell, 'p')
          .flatMap((p) => this.reader.paragraph(p, block.part))
          .flatMap((b) => (b.kind === 'paragraph' ? b.lines : []))
          .filter((line) => line.length > 0),
      );
      const firstParagraph = cells[0] === undefined ? undefined : elementsOf(cells[0], 'p')[0];
      if (firstParagraph !== undefined && cellLook === undefined) {
        cellLook = this.looks.lookOf(firstParagraph);
        cellWordStyle = this.looks.styleOf(firstParagraph);
      }
      if (cells.length > 2) {
        this.reader.approximated.push(
          'A table row with more than two cells is one label and one value, the other cells joined.',
        );
      }
      const label = (texts[0] ?? [])
        .flat()
        .map((part) => (part.kind === 'text' ? part.text : part.label))
        .join(' ');
      const value: SlotPart[] = [];
      for (const lines of texts.slice(1)) {
        for (const line of lines) {
          if (value.length > 0) value.push({ kind: 'text', text: ' ' });
          value.push(...line);
        }
      }
      tableRows.push({ label, value });
    }
    const cellStyle = this.styleFor(cellLook ?? {}, cellWordStyle);
    const firstCell = rows[0] === undefined ? undefined : elementsOf(rows[0], 'tc')[0];
    const cellBorders = childOf(childOf(firstCell, 'tcPr'), 'tcBorders');
    const tableBorders = childOf(childOf(table, 'tblPr'), 'tblBorders');
    // Without borders of the table, those of its first cell stand for them.
    const fromCell: Readonly<Record<string, string>> = { insideH: 'bottom', insideV: 'right' };
    const border = (name: string): ImportedBorder | undefined => {
      const side =
        tableBorders === undefined
          ? childOf(cellBorders, fromCell[name] ?? name)
          : childOf(tableBorders, name);
      const value = side?.attrs['val'];
      if (side === undefined || value === undefined || value === 'none' || value === 'nil')
        return undefined;
      const hex = side.attrs['color'];
      return {
        widthPt: Number(side.attrs['sz'] ?? '4') / 8,
        color: this.colorToken(hex !== undefined && /^[0-9A-Fa-f]{6}$/.test(hex) ? hex : '000000'),
      };
    };
    const styleName = `${this.name}-table${this.tableStyles.length === 0 ? '' : `-${String(this.tableStyles.length + 1)}`}`;
    const outer = border('top') ?? border('left');
    const insideHorizontal = border('insideH');
    const insideVertical = border('insideV');
    this.tableStyles.push({
      name: styleName,
      cellStyle,
      ...(outer !== undefined ? { outer } : {}),
      ...(insideHorizontal !== undefined ? { insideHorizontal } : {}),
      ...(insideVertical !== undefined ? { insideVertical } : {}),
      cellPaddingPt: 3,
    });
    this.full(block.heightPt, {
      valign: 'top',
      content: [{ kind: 'table', style: styleName as StyleName, rows: tableRows }],
    });
    this.converted.push(
      `A table with borders as a cover table of ${String(tableRows.length)} rows.`,
    );
  }

  /** The grid: columns from the boundaries of layout tables, and the rows that fill the cover. */
  grid(margins: Partial<PageMargins>, heightPt: number): CoverGrid {
    const empty = (row: GridRow | undefined): boolean =>
      row !== undefined &&
      row.share !== true &&
      row.boundaries === undefined &&
      row.cells.every((cell) => cell.area === undefined);
    for (let index = this.rows.length - 1; index > 0; index -= 1) {
      const row = this.rows[index];
      const above = this.rows[index - 1];
      if (row !== undefined && above !== undefined && empty(row) && empty(above)) {
        above.heightPt += row.heightPt;
        this.rows.splice(index, 1);
      }
    }
    // An edge within a point of another is that edge, so that a table a little narrower than the
    // page does not make a sliver of a column.
    const sorted = [0, round(this.widthPt)];
    for (const row of this.rows) {
      for (const edge of row.boundaries ?? []) {
        const at = round(Math.min(edge, this.widthPt));
        if (sorted.every((known) => Math.abs(known - at) > 1)) sorted.push(at);
      }
    }
    sorted.sort((a, b) => a - b);
    const snap = (edge: number): number =>
      sorted.reduce((best, known) =>
        Math.abs(known - edge) < Math.abs(best - edge) ? known : best,
      );
    const columns: CoverColumnWidth[] = sorted.slice(1).map((edge, index) => {
      const widthPt = round(edge - (sorted[index] ?? 0));
      return index === sorted.length - 2
        ? { kind: 'share', fr: 1 }
        : { kind: 'points', pt: widthPt };
    });
    const columnOf = (edge: number): number =>
      sorted.indexOf(snap(round(Math.min(edge, this.widthPt))));
    const fixed = this.rows.reduce(
      (sum, row) => sum + (row.share === true ? 0 : Math.max(1, round(row.heightPt))),
      0,
    );
    const room = heightPt - 2;
    const scale = fixed > room ? room / fixed : 1;
    if (scale < 1) {
      this.reader.approximated.push(
        'The cover was taller than the page, so its rows were made lower.',
      );
    }
    const rows: CoverRowHeight[] = this.rows.map((row) =>
      row.share === true
        ? { kind: 'share', fr: 1 }
        : { kind: 'points', pt: Math.max(0.5, round(row.heightPt * scale)) },
    );
    const area: Record<string, CoverArea> = {};
    let count = 0;
    const areas = this.rows.map((row) => {
      const line = sorted.slice(1).map(() => '.');
      for (const cell of row.cells) {
        if (cell.area === undefined) continue;
        count += 1;
        const name = `area-${String(count)}`;
        area[name] = cell.area;
        const from = row.boundaries === undefined ? 0 : columnOf(row.boundaries[cell.from] ?? 0);
        const to =
          row.boundaries === undefined
            ? sorted.length - 1
            : columnOf(row.boundaries[cell.to] ?? this.widthPt);
        for (let column = from; column < Math.max(to, from + 1); column += 1) line[column] = name;
      }
      return line;
    });
    return { kind: 'grid', margins, columns, rows, areas, area };
  }
}
