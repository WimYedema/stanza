import type { Diagnostic } from './diagnostic.js';
import type { Block, Document, ListItemBlock } from './document.js';
import { isNodeId, type NodeId } from './ids.js';

export interface AssignIdsOptions {
  /** IDs already used elsewhere in the project, which new IDs must avoid. */
  readonly used: ReadonlySet<string>;
  /** Produces candidate IDs. The host supplies it because `core` has no random source. */
  readonly generate: () => string;
  /** How many candidates to try per block before giving up. Defaults to 20. */
  readonly maxAttempts?: number;
}

export interface AssignIdsResult {
  readonly document: Document;
  /** The IDs that were added, in document order. */
  readonly assigned: readonly NodeId[];
  readonly diagnostics: readonly Diagnostic[];
}

const DEFAULT_ATTEMPTS = 20;

function forEachBlock(blocks: readonly Block[], visit: (block: Block) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.type === 'list') {
      for (const item of block.items) forEachBlock(item.blocks, visit);
    }
  }
}

/**
 * Gives every heading and table that lacks an ID a new one, in document order. Existing IDs are
 * never changed, and duplicates within the document are reported.
 */
export function assignMissingIds(document: Document, options: AssignIdsOptions): AssignIdsResult {
  const taken = new Set(options.used);
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  forEachBlock(document.blocks, (block) => {
    if (block.id === undefined) return;
    if (seen.has(block.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-id',
        message: `The ID ${block.id} is used more than once.`,
        nodeId: block.id,
      });
    }
    seen.add(block.id);
    taken.add(block.id);
  });

  const assigned: NodeId[] = [];
  const attempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;

  const fresh = (): NodeId | undefined => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = options.generate();
      if (!isNodeId(candidate)) throw new Error(`The ID generator returned "${candidate}".`);
      if (taken.has(candidate)) continue;
      taken.add(candidate);
      assigned.push(candidate);
      return candidate;
    }
    diagnostics.push({
      severity: 'error',
      code: 'id-generation-failed',
      message: `No unused ID found after ${String(attempts)} attempts.`,
    });
    return undefined;
  };

  const withId = <T extends Block>(block: T): T => {
    if (block.id !== undefined) return block;
    const id = fresh();
    return id === undefined ? block : { ...block, id };
  };

  const assignItemBlock = (block: ListItemBlock): ListItemBlock => {
    switch (block.type) {
      case 'list':
        return {
          ...block,
          items: block.items.map((item) => ({ blocks: item.blocks.map(assignItemBlock) })),
        };
      case 'table':
        return withId(block);
      default:
        return block;
    }
  };

  const blocks = document.blocks.map((block) =>
    block.type === 'heading' ? withId(block) : assignItemBlock(block),
  );
  return { document: { ...document, blocks }, assigned, diagnostics };
}
