import type { HeadingLevel } from './document.js';

/**
 * The deepest level that a heading may have after a heading of the given level: one deeper. A
 * document starts at level 1, so without a heading before it the answer is 1. The editor refuses
 * a heading that skips a level, because numbers and the table of contents depend on a continuous
 * outline (ADR 0029).
 */
export function maxHeadingLevel(previous: HeadingLevel | undefined): HeadingLevel {
  return previous === undefined ? 1 : (Math.min(6, previous + 1) as HeadingLevel);
}
