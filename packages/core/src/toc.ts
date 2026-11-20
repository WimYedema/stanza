import type { Diagnostic } from './diagnostic.js';
import type { Block, Inline } from './document.js';
import type { NodeId } from './ids.js';
import { isStyleName, type StyleName } from './style-name.js';

/** The kind of the `stanza-toc` block (ADR 0018). */
export const TOC_STANZA_KIND = 'toc';

export const DEFAULT_TOC_DEPTH = 3;
export const MAX_TOC_DEPTH = 6;

/** The paragraph style of the entries of a level: `toc-1` to `toc-6`. */
export function tocStyleName(level: number): StyleName {
  const name = `toc-${String(level)}`;
  if (!isStyleName(name)) throw new Error(`Invalid table of contents level ${String(level)}.`);
  return name;
}

export interface TocOptions {
  readonly depth: number;
}

/**
 * Reads the body of a `stanza-toc` block: empty, or a line `depth: N` with N from 1 to 6. The
 * options are returned with the default depth wherever a problem was found.
 */
export function readTocOptions(text: string): {
  readonly options: TocOptions;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const problem = (message: string): void => {
    diagnostics.push({ severity: 'error', code: 'invalid-toc-options', message });
  };
  let depth: number | undefined;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const match = /^([a-z-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (match?.[1] !== 'depth') {
      problem(`Unknown line "${trimmed}". The only option is "depth: N".`);
    } else if (depth !== undefined) {
      problem('The depth is given twice.');
    } else if (!/^[1-6]$/.test(match[2] ?? '')) {
      problem(`The depth must be a whole number from 1 to ${String(MAX_TOC_DEPTH)}.`);
    } else {
      depth = Number(match[2]);
    }
  }
  return { options: { depth: depth ?? DEFAULT_TOC_DEPTH }, diagnostics };
}

export interface TocEntry {
  readonly level: number;
  /** The literal heading number, a space, and the plain text of the heading. */
  readonly text: string;
  /** The ID of the heading, which the entry links to; absent when the heading has none. */
  readonly id: NodeId | undefined;
}

const plainText = (content: readonly Inline[]): string =>
  content.map((inline) => inline.text).join('');

/**
 * The entries of a table of contents: the top-level headings down to `depth`, in order. `labels`
 * are the heading numbers of the document, as `numberHeadings` gives them.
 */
export function collectTocEntries(
  blocks: readonly Block[],
  labels: readonly (string | undefined)[],
  depth: number,
): readonly TocEntry[] {
  const entries: TocEntry[] = [];
  blocks.forEach((block, index) => {
    if (block.type !== 'heading' || block.level > depth) return;
    const label = labels[index];
    const text = plainText(block.content);
    entries.push({
      level: block.level,
      text: label === undefined ? text : `${label} ${text}`,
      id: block.id,
    });
  });
  return entries;
}
