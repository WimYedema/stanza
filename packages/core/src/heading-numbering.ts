import type { Diagnostic } from './diagnostic.js';
import type { Document } from './document.js';
import { defaultHeadingStyle } from './default-styles.js';
import { resolveParagraphStyle } from './style-resolution.js';
import type { Stylesheet } from './stylesheet.js';

export interface HeadingNumbers {
  /** The number of each top-level block, such as `1.2`; undefined for blocks that have none. */
  readonly labels: readonly (string | undefined)[];
  /** The counter of each heading level after the last block, to continue from in a later document. */
  readonly counters: readonly number[];
  readonly diagnostics: readonly Diagnostic[];
}

const LEVELS = 6;

/**
 * Numbers the headings of a document in the hierarchical decimal scheme (`1`, `1.1`, `1.1.1`).
 * A heading is numbered when its resolved style has `numbered` set. Unnumbered headings do not
 * change the counters. `start` holds the counters to continue from, level 1 first.
 */
export function numberHeadings(
  document: Document,
  stylesheet: Stylesheet,
  start: readonly number[] = [],
): HeadingNumbers {
  const counters = Array.from({ length: LEVELS }, (_, index) => start[index] ?? 0);
  const diagnostics: Diagnostic[] = [];
  const labels = document.blocks.map((block, index): string | undefined => {
    if (block.type !== 'heading') return undefined;
    const style = block.style ?? defaultHeadingStyle(block.level);
    if (resolveParagraphStyle(stylesheet, style)?.paragraph.numbered !== true) return undefined;

    const position = block.level - 1;
    counters[position] = (counters[position] ?? 0) + 1;
    counters.fill(0, position + 1);
    const parts = counters.slice(0, block.level);
    const label = parts.join('.');
    const missing = parts.findIndex((count, level) => level < position && count === 0);
    if (missing >= 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'heading-level-skipped',
        message: `There is no numbered level ${String(missing + 1)} heading above this heading, so its number is ${label}.`,
        path: `blocks[${String(index)}]`,
        ...(block.id !== undefined ? { nodeId: block.id } : {}),
      });
    }
    return label;
  });
  return { labels, counters, diagnostics };
}
