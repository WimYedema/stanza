import { type Alignment } from '@stanza/core';
import { childOf, elementsOf, type XmlElement } from '../xml.js';
import {
  type Border,
  type Frame,
  type Look,
  round,
  runsOf,
  textOfRun,
  twipsToPt,
} from './shared.js';

/**
 * The look of paragraphs and runs: styles, direct properties, theme colors and fonts, frames and
 * borders.
 */

export interface Theme {
  readonly fonts: { readonly major?: string; readonly minor?: string };
  readonly colors: ReadonlyMap<string, string>;
}

export const THEME_COLOR_NAMES: Readonly<Record<string, string>> = {
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

export function readTheme(xml: XmlElement | undefined): Theme {
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

export const ALIGNMENTS: Readonly<Record<string, Alignment>> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify',
};

export const toggle = (properties: XmlElement | undefined, name: string): boolean | undefined => {
  const element = childOf(properties, name);
  if (element === undefined) return undefined;
  const value = element.attrs['val']?.toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
};

export class Looks {
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
