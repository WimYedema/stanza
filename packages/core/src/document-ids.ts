import type { Block, Document, ListItemBlock } from './document.js';
import type { NodeId } from './ids.js';

export interface BlockId {
  readonly id: NodeId;
  /** The path of the block, such as `blocks[2].items[0].blocks[1]`. */
  readonly path: string;
}

/** The IDs of all blocks of a document in document order, nested blocks included. */
export function collectBlockIds(document: Document): readonly BlockId[] {
  const found: BlockId[] = [];
  const visit = (block: Block | ListItemBlock, path: string): void => {
    if (block.id !== undefined) found.push({ id: block.id, path });
    if (block.type !== 'list') return;
    block.items.forEach((item, itemIndex) => {
      item.blocks.forEach((child, index) => {
        visit(child, `${path}.items[${String(itemIndex)}].blocks[${String(index)}]`);
      });
    });
  };
  document.blocks.forEach((block, index) => {
    visit(block, `blocks[${String(index)}]`);
  });
  return found;
}
