import type { HeadingLevel } from '@stanza/core';
import { childOf, elementsOf, type XmlElement } from './xml.js';

/** What the import reads of a Word style. The look of a style is never read (ADR 0043). */
interface StyleInfo {
  readonly id: string;
  readonly type: string;
  /** The name in lower case, which is stable across the languages of Word. */
  readonly name: string;
  readonly basedOn: string | undefined;
  readonly bold: boolean | undefined;
  readonly italic: boolean | undefined;
  readonly monospace: boolean | undefined;
  readonly numId: string | undefined;
  readonly level: number;
}

const MONOSPACE_FONTS = new Set(
  [
    'consolas',
    'courier new',
    'courier',
    'lucida console',
    'menlo',
    'monaco',
    'source code pro',
    'cascadia code',
    'cascadia mono',
    'fira code',
    'fira mono',
    'jetbrains mono',
    'dejavu sans mono',
    'liberation mono',
    'lucida sans typewriter',
    'andale mono',
    'sf mono',
    'ubuntu mono',
    'roboto mono',
  ].map((name) => name.toLowerCase()),
);

/** The value of an on/off property such as `<w:b/>` or `<w:b w:val="0"/>`. */
export function toggleOf(properties: XmlElement | undefined, name: string): boolean | undefined {
  const element = childOf(properties, name);
  if (element === undefined) return undefined;
  const value = element.attrs['val']?.toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
}

export function isMonospace(properties: XmlElement | undefined): boolean | undefined {
  const fonts = childOf(properties, 'rFonts');
  if (fonts === undefined) return undefined;
  const names = ['ascii', 'hAnsi', 'cs']
    .map((key) => fonts.attrs[key]?.toLowerCase())
    .filter((name): name is string => name !== undefined);
  return names.length === 0 ? undefined : names.some((name) => MONOSPACE_FONTS.has(name));
}

function readStyle(element: XmlElement): StyleInfo | undefined {
  const id = element.attrs['styleId'];
  if (id === undefined) return undefined;
  const paragraph = childOf(element, 'pPr');
  const numbering = childOf(paragraph, 'numPr');
  const run = childOf(element, 'rPr');
  return {
    id,
    type: element.attrs['type'] ?? 'paragraph',
    name: (childOf(element, 'name')?.attrs['val'] ?? id).toLowerCase(),
    basedOn: childOf(element, 'basedOn')?.attrs['val'],
    bold: toggleOf(run, 'b'),
    italic: toggleOf(run, 'i'),
    monospace: isMonospace(run),
    numId: childOf(numbering, 'numId')?.attrs['val'],
    level: Number(childOf(numbering, 'ilvl')?.attrs['val'] ?? '0') || 0,
  };
}

export interface ParagraphNumbering {
  readonly numId: string;
  readonly level: number;
}

export interface RunStyle {
  readonly bold: boolean | undefined;
  readonly italic: boolean | undefined;
  readonly monospace: boolean | undefined;
}

/** The styles of the document, with the lookups that the import needs. */
export class DocxStyles {
  private readonly byId = new Map<string, StyleInfo>();

  constructor(styles: XmlElement | undefined) {
    for (const element of elementsOf(styles, 'style')) {
      const style = readStyle(element);
      if (style !== undefined) this.byId.set(style.id, style);
    }
  }

  /** The style and the styles it is based on, nearest first. A loop in `basedOn` ends the chain. */
  private chain(id: string | undefined): StyleInfo[] {
    const found: StyleInfo[] = [];
    const seen = new Set<string>();
    let next = id;
    while (next !== undefined && !seen.has(next)) {
      seen.add(next);
      const style = this.byId.get(next);
      if (style === undefined) break;
      found.push(style);
      next = style.basedOn;
    }
    return found;
  }

  /** The name that Word shows for a style: its own name, or the ID when the style is unknown. */
  nameOf(id: string | undefined): string {
    return id === undefined ? 'normal' : (this.byId.get(id)?.name ?? id.toLowerCase());
  }

  /** The heading level of a paragraph style, by its name and then by the styles it is based on. */
  headingLevel(id: string | undefined): HeadingLevel | undefined {
    const chain = this.chain(id);
    if (chain.length === 0 && id !== undefined) chain.push(this.unknown(id));
    for (const style of chain) {
      if (style.name === 'toc heading') return undefined;
      const match = /^heading ([1-6])$/.exec(style.name);
      if (match?.[1] !== undefined) return Number(match[1]) as HeadingLevel;
    }
    return undefined;
  }

  /** The numbering that a paragraph style gives, from the style or the styles it is based on. */
  numberingOf(id: string | undefined): ParagraphNumbering | undefined {
    for (const style of this.chain(id)) {
      if (style.numId !== undefined) return { numId: style.numId, level: style.level };
    }
    return undefined;
  }

  /** The bold, italic and monospace that a character style gives. */
  runStyle(id: string | undefined): RunStyle {
    const chain = this.chain(id);
    const first = <T>(pick: (style: StyleInfo) => T | undefined): T | undefined => {
      for (const style of chain) {
        const value = pick(style);
        if (value !== undefined) return value;
      }
      return undefined;
    };
    const monospace =
      first((style) => style.monospace) ??
      (chain.some((style) => /^(html code|source code|verbatim char|code)$/.test(style.name))
        ? true
        : undefined);
    return {
      bold: first((style) => style.bold),
      italic: first((style) => style.italic),
      monospace,
    };
  }

  private unknown(id: string): StyleInfo {
    return {
      id,
      type: 'paragraph',
      name: id.replace(/^heading(\d)$/i, 'heading $1').toLowerCase(),
      basedOn: undefined,
      bold: undefined,
      italic: undefined,
      monospace: undefined,
      numId: undefined,
      level: 0,
    };
  }
}
