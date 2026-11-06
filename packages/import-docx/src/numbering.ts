import { childOf, elementsOf, type XmlElement } from './xml.js';
import type { DocxStyles } from './styles.js';

export type ListKind = 'bulleted' | 'numbered';

/** Which numbering definition a paragraph's `numId` leads to, and whether its level is a bullet. */
export class DocxNumbering {
  private readonly abstractOf = new Map<string, string>();
  private readonly levels = new Map<string, Map<number, string>>();
  private readonly links = new Map<string, string>();

  constructor(
    numbering: XmlElement | undefined,
    private readonly styles: DocxStyles,
  ) {
    for (const abstract of elementsOf(numbering, 'abstractNum')) {
      const id = abstract.attrs['abstractNumId'];
      if (id === undefined) continue;
      const formats = new Map<number, string>();
      for (const level of elementsOf(abstract, 'lvl')) {
        const format = childOf(level, 'numFmt')?.attrs['val'];
        if (format !== undefined) formats.set(Number(level.attrs['ilvl'] ?? '0') || 0, format);
      }
      this.levels.set(id, formats);
      const link = childOf(abstract, 'numStyleLink')?.attrs['val'];
      if (link !== undefined) this.links.set(id, link);
    }
    for (const num of elementsOf(numbering, 'num')) {
      const id = num.attrs['numId'];
      const abstract = childOf(num, 'abstractNumId')?.attrs['val'];
      if (id !== undefined && abstract !== undefined) this.abstractOf.set(id, abstract);
    }
  }

  /** The kind of list at a level, or undefined when the numbering is not defined. */
  kindOf(numId: string, level: number, depth = 0): ListKind | undefined {
    const abstract = this.abstractOf.get(numId);
    if (abstract === undefined) return undefined;
    const format = this.levels.get(abstract)?.get(level);
    if (format === undefined) {
      // A definition may only point to the numbering of a list style.
      const link = this.links.get(abstract);
      const linked = link === undefined ? undefined : this.styles.numberingOf(link);
      return linked === undefined || depth > 3 || linked.numId === numId
        ? undefined
        : this.kindOf(linked.numId, level, depth + 1);
    }
    return format === 'bullet' || format === 'none' ? 'bulleted' : 'numbered';
  }
}
