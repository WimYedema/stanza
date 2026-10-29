import type { StyleName } from '@phrase/core';

const words = (name: StyleName): string[] => name.split('-');
const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** The Word style ID: `body` is `Normal`, `heading-1` is `Heading1`, others are PascalCase. */
export function wordStyleId(name: StyleName): string {
  return name === 'body' ? 'Normal' : words(name).map(capitalized).join('');
}

/** The display name of a style in Word. Word's own names for headings let outline features work. */
export function wordStyleName(name: StyleName): string {
  if (name === 'body') return 'Normal';
  const heading = /^heading-([1-6])$/.exec(name);
  if (heading?.[1] !== undefined) return `heading ${heading[1]}`;
  return words(name).map(capitalized).join(' ');
}
