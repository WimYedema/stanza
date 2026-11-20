import {
  collectTocEntries,
  readTocOptions,
  tocStyleName,
  type Block,
  type StanzaBlock,
  type TocEntry,
} from '@stanza/core';
import { InternalHyperlink, Paragraph, TableOfContents, TextRun, type ParagraphChild } from 'docx';
import { bookmarkName } from './bookmark-name.js';
import type { BuildContext } from './content.js';
import { wordStyleId } from './style-ids.js';

/** Entries as plain linked paragraphs: no field, no tabs, no page numbers, and no prompt. */
function plainEntries(entries: readonly TocEntry[]): Paragraph[] {
  return entries.map((entry) => {
    const text = new TextRun(entry.text);
    const children: ParagraphChild[] =
      entry.id === undefined
        ? [text]
        : [new InternalHyperlink({ anchor: bookmarkName(entry.id), children: [text] })];
    return new Paragraph({ style: wordStyleId(tocStyleName(entry.level)), children });
  });
}

/**
 * A table of contents. With page numbers it is a Word table-of-contents field marked for update,
 * so Word asks once on open and then fills in the page numbers; the cached entries are visible and
 * linked before that, with an empty page number. Without page numbers it is plain text.
 */
export function buildToc(
  block: StanzaBlock,
  blocks: readonly Block[],
  context: BuildContext,
): (Paragraph | TableOfContents)[] {
  const { depth } = readTocOptions(block.text).options;
  const entries = collectTocEntries(blocks, context.headingLabels, depth);
  // A table of contents without headings has nothing to show, and was warned about.
  if (entries.length === 0) return [];
  if (!context.stylesheet.tableOfContents.pageNumbers) return plainEntries(entries);
  return [
    new TableOfContents('Contents', {
      hyperlink: true,
      headingStyleRange: `1-${String(depth)}`,
      useAppliedParagraphOutlineLevel: true,
      beginDirty: true,
      cachedEntries: entries.map((entry) => ({
        title: entry.text,
        level: entry.level,
        ...(entry.id !== undefined ? { href: bookmarkName(entry.id) } : {}),
      })),
    }),
  ];
}
