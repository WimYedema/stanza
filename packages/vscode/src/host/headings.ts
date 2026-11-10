import { numberHeadings, type Inline, type Stylesheet } from '@phrase/core';
import { parseDocument } from '@phrase/format';

export interface HeadingItem {
  /** The number of the heading among the top-level blocks of the document. */
  readonly block: number;
  readonly level: number;
  /** `1.2` when the style numbers the heading and a stylesheet is known. */
  readonly number: string | undefined;
  readonly title: string;
}

const plain = (content: readonly Inline[]): string => content.map((run) => run.text).join('');

/** The headings of a document in the order they are written, with their numbers (ADR 0011). */
export function listHeadings(
  text: string,
  stylesheet: Stylesheet | undefined,
): readonly HeadingItem[] {
  const { document } = parseDocument(text);
  const labels = stylesheet === undefined ? [] : numberHeadings(document, stylesheet).labels;
  return document.blocks.flatMap((block, index) =>
    block.type === 'heading'
      ? [{ block: index, level: block.level, number: labels[index], title: plain(block.content) }]
      : [],
  );
}
