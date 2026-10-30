import type { StyleName, VariantMark } from '@phrase/core';

/**
 * The class names that tie the generated CSS to the DOM of the editor (ADR 0021). The compiler
 * writes its selectors with them and the editor adapter writes them into the markup, so the two
 * cannot drift apart.
 */

/** The root of the editor, which the CSS is scoped to. */
export const SCOPE_CLASS = 'phrase-document';

/** A bulleted or numbered list element. */
export const LIST_CLASS = 'phrase-list';

/** A block in a paragraph style. */
export const paragraphClass = (name: StyleName): string => `phrase-p-${name}`;

/** A list item, whose text takes its look from the list or paragraph style of the item. */
export const listItemClass = (name: StyleName): string => `phrase-li-${name}`;

/** A run in a character style. */
export const characterClass = (name: StyleName): string => `phrase-c-${name}`;

/** A table in a table style. */
export const tableClass = (name: StyleName): string => `phrase-t-${name}`;

/** A run with a mark. Marks are nested in the canonical mark order. */
export const markClass = (mark: VariantMark): string => `phrase-m-${mark}`;
