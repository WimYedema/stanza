import type { Document, HeadingLevel, Inline } from './document.js';
import type { NodeId } from './ids.js';

/** How a heading matched what was looked for, from the strongest to the weakest. */
export type SuggestionMatch = 'title' | 'prefix' | 'contains' | 'words';

const MATCH_ORDER: readonly SuggestionMatch[] = ['title', 'prefix', 'contains', 'words'];

/** A heading that a reference can point at (ADR 0069, ADR 0070). */
export interface ReferenceSuggestion {
  readonly id: NodeId;
  readonly level: HeadingLevel;
  /** The plain text of the heading, which is also what a reference to it says when nothing was selected. */
  readonly text: string;
  /** Absent when nothing was looked for, or when nothing matched and all headings are given. */
  readonly match?: SuggestionMatch;
}

const plainText = (content: readonly Inline[]): string =>
  content.map((inline) => inline.text).join('');

/** Lower case, one space between words, and no punctuation around the whole. */
const normalized = (text: string): string =>
  text
    .replace(/^[\s(["'\u201c]+|[\s.,;:)\]"'\u201d]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}_]/u.test(char);

function matchOf(text: string, query: string): SuggestionMatch | undefined {
  const whole = normalized(text);
  if (whole === query) return 'title';
  // A start counts only at the end of a word, so that "I5" does not start "I50".
  if (whole.startsWith(query) && !isWordChar(whole[query.length])) return 'prefix';
  if (whole.includes(query)) return 'contains';
  return query.split(' ').every((word) => whole.includes(word)) ? 'words' : undefined;
}

/**
 * The top-level headings that have an ID, as targets for a reference. With something to look for,
 * only the headings that match it are given, the best match first and in document order within
 * the same kind of match; when none matches, all headings are, in document order, so that a person
 * can still choose one. It goes by the text of the headings alone and knows nothing of how a
 * document names them. Pure and deterministic, with no network and no model.
 */
export function suggestReferences(
  document: Document,
  query: string,
): readonly ReferenceSuggestion[] {
  const wanted = normalized(query);
  const all: ReferenceSuggestion[] = [];
  for (const block of document.blocks) {
    if (block.type !== 'heading' || block.id === undefined) continue;
    const text = plainText(block.content).trim();
    const match = wanted === '' ? undefined : matchOf(text, wanted);
    all.push({ id: block.id, level: block.level, text, ...(match !== undefined ? { match } : {}) });
  }
  const matched = all.filter((suggestion) => suggestion.match !== undefined);
  if (matched.length === 0) return all;
  const rank = (suggestion: ReferenceSuggestion): number =>
    suggestion.match === undefined ? MATCH_ORDER.length : MATCH_ORDER.indexOf(suggestion.match);
  // `sort` is stable, so headings with the same kind of match stay in document order.
  return matched.sort((a, b) => rank(a) - rank(b));
}
