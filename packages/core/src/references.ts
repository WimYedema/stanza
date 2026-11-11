import type { Block, Document, Inline, LinkMark, ListItemBlock, TableCell } from './document.js';
import { isNodeId, type NodeId } from './ids.js';

/** A block that has an ID, so that a reference can point at it (ADR 0068). */
export interface ReferenceTarget {
  readonly id: NodeId;
  readonly kind: (Block | ListItemBlock)['type'];
  /** The path of the block, such as `blocks[2].items[0].blocks[1]`. */
  readonly path: string;
}

/** A link whose destination is `#` and what follows it, which should be the ID of a block. */
export interface Reference {
  /** What follows the `#`. It is not checked here: a broken reference is one that does not resolve. */
  readonly target: string;
  /** The text of the link, as written. */
  readonly text: string;
  /** The path of the content that holds it, such as `blocks[2].content`. */
  readonly path: string;
  /** The ID of the block that holds the reference, when it has one. */
  readonly blockId?: NodeId;
}

export interface ReferenceIndex {
  /** The first block with each ID; a second one is a `duplicate-id` of the validation. */
  readonly targets: ReadonlyMap<NodeId, ReferenceTarget>;
  /** In document order. */
  readonly references: readonly Reference[];
}

const fragmentOf = (inline: Inline | undefined): string | undefined => {
  const link = inline?.marks.find((mark): mark is LinkMark => mark.type === 'link');
  return link?.href.startsWith('#') === true ? link.href.slice(1) : undefined;
};

/** Reads the targets and the references of a document. It is derived each time, never stored. */
export function indexReferences(document: Document): ReferenceIndex {
  const targets = new Map<NodeId, ReferenceTarget>();
  const references: Reference[] = [];

  const collect = (content: readonly Inline[], path: string, blockId: NodeId | undefined): void => {
    let index = 0;
    while (index < content.length) {
      const target = fragmentOf(content[index]);
      if (target === undefined) {
        index += 1;
        continue;
      }
      // Runs that share a destination are one reference, as they are one link in the export.
      let end = index + 1;
      while (fragmentOf(content[end]) === target) end += 1;
      references.push({
        target,
        text: content
          .slice(index, end)
          .map((inline) => inline.text)
          .join(''),
        path,
        ...(blockId !== undefined ? { blockId } : {}),
      });
      index = end;
    }
  };

  const visit = (block: Block | ListItemBlock, path: string): void => {
    if (block.id !== undefined && !targets.has(block.id)) {
      targets.set(block.id, { id: block.id, kind: block.type, path });
    }
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        collect(block.content, `${path}.content`, block.id);
        break;
      case 'list':
        block.items.forEach((item, itemIndex) => {
          item.blocks.forEach((child, index) => {
            visit(child, `${path}.items[${String(itemIndex)}].blocks[${String(index)}]`);
          });
        });
        break;
      case 'table': {
        const visitCell = (cell: TableCell, cellPath: string): void => {
          cell.blocks.forEach((child, index) => {
            visit(child, `${cellPath}.blocks[${String(index)}]`);
          });
        };
        block.header.forEach((cell, index) => {
          visitCell(cell, `${path}.header[${String(index)}]`);
        });
        block.rows.forEach((row, rowIndex) => {
          row.forEach((cell, index) => {
            visitCell(cell, `${path}.rows[${String(rowIndex)}][${String(index)}]`);
          });
        });
        break;
      }
      case 'code':
      case 'phrase':
        break;
    }
  };

  document.blocks.forEach((block, index) => {
    visit(block, `blocks[${String(index)}]`);
  });
  return { targets, references };
}

/** The block that a reference points at, or undefined when there is none. */
export function resolveReference(
  index: ReferenceIndex,
  target: string,
): ReferenceTarget | undefined {
  return isNodeId(target) ? index.targets.get(target) : undefined;
}

/** The references that point at a block, in document order. */
export const findIncoming = (index: ReferenceIndex, id: NodeId): readonly Reference[] =>
  index.references.filter((reference) => reference.target === id);

/** The references that do not resolve: not the ID of a block, or the ID of a block that is not there. */
export const findBroken = (index: ReferenceIndex): readonly Reference[] =>
  index.references.filter((reference) => resolveReference(index, reference.target) === undefined);
