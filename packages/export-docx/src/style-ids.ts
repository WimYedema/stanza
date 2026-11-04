import { fixedWordStyleName, type StyleName } from '@phrase/core';

const words = (name: StyleName): string[] => name.split('-');
const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** The Word style ID: `body` is `Normal`, `heading-1` is `Heading1`, `toc-1` is `TOC1`, others are PascalCase. */
export function wordStyleId(name: StyleName): string {
  if (name === 'body') return 'Normal';
  const toc = /^toc-([1-6])$/.exec(name);
  if (toc?.[1] !== undefined) return `TOC${toc[1]}`;
  return words(name).map(capitalized).join('');
}

/**
 * The display name of a style in Word. Word's own names for body, headings and TOC entries let its
 * features work, so they win over a label. Any other style is shown by its label, or else by its
 * name in title case (ADR 0034).
 */
export function wordStyleName(name: StyleName, label?: string): string {
  return fixedWordStyleName(name) ?? label ?? words(name).map(capitalized).join(' ');
}
