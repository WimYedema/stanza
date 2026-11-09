import type { NodeId } from './ids.js';
import type { StyleName } from './style-name.js';

export type MetaValue = string | readonly string[];

export interface DocumentMeta {
  readonly title?: string;
  readonly authors?: readonly string[];
  readonly classification?: string;
  /** Project-specific entries with kebab-case keys. */
  readonly fields: Readonly<Record<string, MetaValue>>;
}

export interface Document {
  readonly meta: DocumentMeta;
  readonly blocks: readonly Block[];
}

interface BlockBase {
  /** Optional in the model; validation requires it on referenceable blocks. */
  readonly id?: NodeId;
  /** Absent means the default style for the kind of block. */
  readonly style?: StyleName;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface Heading extends BlockBase {
  readonly type: 'heading';
  readonly level: HeadingLevel;
  readonly content: readonly Inline[];
}

export interface Paragraph extends BlockBase {
  readonly type: 'paragraph';
  readonly content: readonly Inline[];
}

export interface List extends BlockBase {
  readonly type: 'list';
  readonly kind: 'bulleted' | 'numbered';
  readonly items: readonly ListItem[];
}

export interface ListItem {
  readonly blocks: readonly ListItemBlock[];
}

export interface Table extends BlockBase {
  readonly type: 'table';
  /** Relative column weights; absent means autofit. */
  readonly widths?: readonly number[];
  readonly header: readonly TableCell[];
  readonly rows: readonly (readonly TableCell[])[];
}

/** What a table cell may hold (ADR 0048). Validation keeps list items to the same two kinds. */
export type CellBlock = Paragraph | List;

/** A cell is empty (no blocks), plain text (one paragraph), or more. */
export interface TableCell {
  readonly blocks: readonly CellBlock[];
}

export interface CodeBlock extends BlockBase {
  readonly type: 'code';
  readonly language?: string;
  readonly text: string;
}

/** A fenced block whose info string starts with `phrase-`; its body is kept verbatim. */
export interface PhraseBlock extends BlockBase {
  readonly type: 'phrase';
  readonly kind: string;
  readonly text: string;
}

export type Block = Heading | ListItemBlock;

export type ListItemBlock = Paragraph | List | Table | CodeBlock | PhraseBlock;

export type Inline = Text;

export interface Text {
  readonly type: 'text';
  readonly text: string;
  readonly marks: readonly Mark[];
}

export type Mark = StrongMark | EmphasisMark | CodeMark | LinkMark | StyleMark;

export interface StrongMark {
  readonly type: 'strong';
}

export interface EmphasisMark {
  readonly type: 'emphasis';
}

export interface CodeMark {
  readonly type: 'code';
}

export interface LinkMark {
  readonly type: 'link';
  readonly href: string;
}

/** A character style such as a status marker. */
export interface StyleMark {
  readonly type: 'style';
  readonly name: StyleName;
}
