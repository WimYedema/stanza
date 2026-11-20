import type { Block, ListItemBlock, Paragraph, Text } from '@stanza/core';
import type { ImportContext } from './context.js';
import type { ListKind } from './numbering.js';
import { childOf, type XmlElement } from './xml.js';

interface OpenList {
  readonly list: {
    readonly type: 'list';
    readonly kind: ListKind;
    readonly items: { blocks: ListItemBlock[] }[];
  };
  readonly numId: string;
  readonly level: number;
}

/** Collects blocks, and puts consecutive list paragraphs into lists nested by their level. */
export class BlockWriter {
  readonly blocks: Block[] = [];
  private open: OpenList[] = [];

  push(block: Block): void {
    this.open = [];
    this.blocks.push(block);
  }

  addItem(
    kind: ListKind,
    numId: string,
    level: number,
    content: readonly Text[],
    extras: readonly Paragraph[],
  ): void {
    while ((this.open[this.open.length - 1]?.level ?? -1) > level) this.open.pop();
    let top = this.open[this.open.length - 1];
    const fits =
      top?.level === level &&
      top.list.kind === kind &&
      (kind === 'bulleted' || top.numId === numId);
    if (top?.level === level && !fits) {
      this.open.pop();
      top = this.open[this.open.length - 1];
    }
    if (top === undefined || top.level !== level) {
      const list = { type: 'list' as const, kind, items: [] };
      const parent = top?.list.items[top.list.items.length - 1];
      if (parent === undefined) this.blocks.push(list);
      else parent.blocks.push(list);
      top = { list, numId, level };
      this.open.push(top);
    }
    top.list.items.push({ blocks: [{ type: 'paragraph', content }, ...extras] });
  }
}

/** The numbering of a paragraph, from its own properties or its style, unless it has none (`numId` 0). */
export function paragraphNumbering(
  ctx: ImportContext,
  properties: XmlElement | undefined,
  styleId: string | undefined,
): { readonly numId: string; readonly level: number } | undefined {
  const inherited = ctx.styles.numberingOf(styleId);
  const direct = childOf(properties, 'numPr');
  const numId = childOf(direct, 'numId')?.attrs['val'] ?? inherited?.numId;
  if (numId === undefined || numId === '0') return undefined;
  const ilvl = childOf(direct, 'ilvl')?.attrs['val'];
  return { numId, level: ilvl === undefined ? (inherited?.level ?? 0) : Number(ilvl) || 0 };
}
