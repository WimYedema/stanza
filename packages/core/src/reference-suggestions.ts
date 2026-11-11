import type { Document, HeadingLevel, Inline } from './document.js';
import type { NodeId } from './ids.js';

/** How a heading matched what was looked for, from the strongest to the weakest. */
export type SuggestionMatch = 'code' | 'title' | 'prefix' | 'contains' | 'words';

const MATCH_ORDER: readonly SuggestionMatch[] = ['code', 'title', 'prefix', 'contains', 'words'];

/** A heading that a reference can point at (ADR 0069). */
export interface ReferenceSuggestion {
  readonly id: NodeId;
  readonly level: HeadingLevel;
  /** The plain text of the heading. */
  readonly text: string;
  /** What a reference to the heading says when no text was selected: its code, else its text. */
  readonly label: string;
  /** Absent when nothing was looked for, or when nothing matched and all headings are given. */
  readonly match?: SuggestionMatch;
}

const plainText = (content: readonly Inline[]): string =>
  content.map((inline) => inline.text).join('');

/**
 * The code that leads a heading, such as `T6` in "T6 — Unauthorised pipeline changes", and the
 * title after it. A code is a first word with a digit in it, followed by more words.
 */
function splitCode(text: string): { readonly code?: string; readonly title: string } {
  const match = /^(\S*\d\S*)\s+(.*)$/s.exec(text.trim());
  const first = match?.[1];
  const rest = match?.[2]?.replace(/^[\s\u2014\u2013:.-]+/, '');
  if (first === undefined || rest === undefined || rest === '') return { title: text.trim() };
  return { code: first.replace(/[.:,;]+$/, ''), title: rest };
}

/** Lower case, one space between words, and no punctuation around the whole. */
const normalized = (text: string): string =>
  text
    .replace(/^[\s(["'\u201c]+|[\s.,;:)\]"'\u201d]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

function matchOf(text: string, query: string): SuggestionMatch | undefined {
  const { code, title } = splitCode(text);
  const whole = normalized(text);
  const bare = normalized(title);
  if (code !== undefined && normalized(code) === query) return 'code';
  if (whole === query || bare === query) return 'title';
  if (whole.startsWith(query) || bare.startsWith(query)) return 'prefix';
  if (whole.includes(query)) return 'contains';
  return query.split(' ').every((word) => whole.includes(word)) ? 'words' : undefined;
}

/**
 * The top-level headings that have an ID, as targets for a reference. With something to look for,
 * only the headings that match it are given, the best match first and in document order within
 * the same kind of match; when none matches, all headings are, in document order, so that a person
 * can still choose one. Pure and deterministic, with no network and no model.
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
    const { code } = splitCode(text);
    const match = wanted === '' ? undefined : matchOf(text, wanted);
    all.push({
      id: block.id,
      level: block.level,
      text,
      label: code ?? text,
      ...(match !== undefined ? { match } : {}),
    });
  }
  const matched = all.filter((suggestion) => suggestion.match !== undefined);
  if (matched.length === 0) return all;
  const rank = (suggestion: ReferenceSuggestion): number =>
    suggestion.match === undefined ? MATCH_ORDER.length : MATCH_ORDER.indexOf(suggestion.match);
  // `sort` is stable, so headings with the same kind of match stay in document order.
  return matched.sort((a, b) => rank(a) - rank(b));
}
