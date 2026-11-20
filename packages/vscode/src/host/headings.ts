import { numberHeadings, type Document, type Inline, type Stylesheet } from '@stanza/core';
import { parseDocument } from '@stanza/format';

export interface HeadingItem {
  /** The number of the heading among the top-level blocks of the document. */
  readonly block: number;
  readonly level: number;
  /** `1.2` when the style numbers the heading and a stylesheet is known. */
  readonly number: string | undefined;
  readonly title: string;
}

/** A heading with the headings below it: those after it that have a deeper level. */
export interface HeadingNode extends HeadingItem {
  readonly children: readonly HeadingNode[];
}

const plain = (content: readonly Inline[]): string => content.map((run) => run.text).join('');

/** The headings of a document in the order they are written, with their numbers (ADR 0011). */
export function headingsOf(
  document: Document,
  stylesheet: Stylesheet | undefined,
): readonly HeadingItem[] {
  const labels = stylesheet === undefined ? [] : numberHeadings(document, stylesheet).labels;
  return document.blocks.flatMap((block, index) =>
    block.type === 'heading'
      ? [{ block: index, level: block.level, number: labels[index], title: plain(block.content) }]
      : [],
  );
}

/** The headings of the text of a document. */
export function listHeadings(
  text: string,
  stylesheet: Stylesheet | undefined,
): readonly HeadingItem[] {
  return headingsOf(parseDocument(text).document, stylesheet);
}

interface Building {
  readonly item: HeadingItem;
  readonly children: Building[];
}

const finished = (node: Building): HeadingNode => ({
  ...node.item,
  children: node.children.map(finished),
});

/** Nests headings: each goes under the nearest heading before it that has a lower level. */
export function nestHeadings(items: readonly HeadingItem[]): readonly HeadingNode[] {
  const roots: Building[] = [];
  const open: Building[] = [];
  for (const item of items) {
    const node: Building = { item, children: [] };
    while ((open[open.length - 1]?.item.level ?? 0) >= item.level) open.pop();
    (open[open.length - 1]?.children ?? roots).push(node);
    open.push(node);
  }
  return roots.map(finished);
}
