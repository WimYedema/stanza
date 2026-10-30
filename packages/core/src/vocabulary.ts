import type { Block, ListItemBlock, Mark } from './document.js';

/**
 * The vocabulary of a document, declared once (ADR 0003, ADR 0022): the kinds of block and mark
 * and the attributes each has, besides its content. An editor checks its own schema against
 * this, so the two cannot drift apart. It holds structure and style names only, never a visual
 * property.
 */

type BlockType = (Block | ListItemBlock)['type'];

/** The attributes of each kind of block. Every block can have an `id` and a `style`. */
export const BLOCK_ATTRIBUTES = {
  heading: ['id', 'style', 'level'],
  paragraph: ['id', 'style'],
  list: ['id', 'style', 'kind'],
  table: ['id', 'style', 'widths'],
  code: ['id', 'style', 'language'],
  phrase: ['id', 'style', 'kind', 'text'],
} as const satisfies Record<BlockType, readonly string[]>;

/**
 * The marks in canonical order (ADR 0005), with the attributes of each. A run carries its marks in
 * this order, and the first ones are shared by neighbouring runs.
 */
export const MARK_ATTRIBUTES = {
  link: ['href'],
  style: ['name'],
  strong: [],
  emphasis: [],
  code: [],
} as const satisfies Record<Mark['type'], readonly string[]>;

export const MARK_TYPES = Object.keys(MARK_ATTRIBUTES) as readonly Mark['type'][];
