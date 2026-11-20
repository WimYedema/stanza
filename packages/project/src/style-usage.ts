import {
  BODY_STYLE,
  CODE_STYLE,
  LIST_STYLES,
  RESERVED_TABLE_STYLE,
  TOC_STANZA_KIND,
  defaultHeadingStyle,
  readTocOptions,
  resolveTableStyle,
  tocStyleName,
  type Block,
  type CellBlock,
  type Inline,
  type List,
  type ListItemBlock,
  type NodeId,
  type StyleName,
  type Stylesheet,
} from '@stanza/core';
import type { LoadedDocument } from './load.js';

/**
 * How the styles of a stylesheet are used by the documents of a project: by a block that names
 * the style (`direct`), by a block of a kind that has it by default (`default`), and by a style
 * that is based on it (`inherited`, with the style that is used in `via`).
 */
export type UseKind = 'direct' | 'default' | 'inherited';

export interface StyleUse {
  readonly kind: UseKind;
  /** The document, relative to the project root. */
  readonly file: string;
  /** The path of the block, such as `blocks[2].items[0].blocks[1]`. A table stands for its cells. */
  readonly path: string;
  readonly nodeId?: NodeId;
  /** The style that is used, for an inherited use. */
  readonly via?: StyleName;
}

/** Every style of the stylesheet with its uses, in the order of the documents. Unused ones have none. */
export interface StyleUsage {
  readonly paragraphStyles: ReadonlyMap<StyleName, readonly StyleUse[]>;
  readonly characterStyles: ReadonlyMap<StyleName, readonly StyleUse[]>;
  readonly tableStyles: ReadonlyMap<StyleName, readonly StyleUse[]>;
}

/** The uses of one family of styles. A use also counts for every base of the style, as inherited. */
class Uses {
  readonly byStyle = new Map<StyleName, StyleUse[]>();
  private readonly seen = new Set<string>();

  constructor(private readonly styles: ReadonlyMap<StyleName, { readonly basedOn?: StyleName }>) {
    for (const name of styles.keys()) this.byStyle.set(name, []);
  }

  /** A style that the stylesheet does not have is the business of the document checks. */
  add(name: StyleName, use: Omit<StyleUse, 'via'>): void {
    if (!this.record(name, use)) return;
    const visited = new Set<StyleName>([name]);
    let base = this.styles.get(name)?.basedOn;
    while (base !== undefined && !visited.has(base)) {
      visited.add(base);
      this.record(base, { ...use, kind: 'inherited', via: name });
      base = this.styles.get(base)?.basedOn;
    }
  }

  private record(name: StyleName, use: StyleUse): boolean {
    const list = this.byStyle.get(name);
    if (list === undefined) return false;
    const key = [name, use.kind, use.file, use.path, use.via ?? ''].join('\u0000');
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    list.push(use);
    return true;
  }
}

export function styleUsage(
  documents: readonly LoadedDocument[],
  stylesheet: Stylesheet,
): StyleUsage {
  const paragraphs = new Uses(stylesheet.paragraphStyles);
  const characters = new Uses(stylesheet.characterStyles);
  const tables = new Uses(stylesheet.tableStyles);

  for (const { path: file, document } of documents) {
    const place = (path: string, id: NodeId | undefined) => ({
      file,
      path,
      ...(id !== undefined ? { nodeId: id } : {}),
    });

    const marks = (inlines: readonly Inline[], path: string, id: NodeId | undefined): void => {
      for (const inline of inlines) {
        for (const mark of inline.marks) {
          if (mark.type === 'style') {
            characters.add(mark.name, { kind: 'direct', ...place(path, id) });
          }
        }
      }
    };

    // The blocks of a list take its style, so only a list, or a block that names a style, is a use.
    const visitList = (
      list: List,
      path: string,
      id: NodeId | undefined,
      forCell: boolean,
    ): void => {
      const own = forCell ? undefined : list.style;
      const style = own ?? LIST_STYLES[list.kind];
      paragraphs.add(style, { kind: own === undefined ? 'default' : 'direct', ...place(path, id) });
      list.items.forEach((item, itemIndex) => {
        item.blocks.forEach((child: ListItemBlock, index) => {
          const childPath = `${path}.items[${String(itemIndex)}].blocks[${String(index)}]`;
          if (forCell) {
            if (child.type === 'paragraph') marks(child.content, path, id);
            else if (child.type === 'list') visitList(child, path, id, true);
          } else {
            visit(child, childPath, true);
          }
        });
      });
    };

    const visitCell = (block: CellBlock, path: string, id: NodeId | undefined, cell: StyleName) => {
      if (block.type === 'paragraph') {
        paragraphs.add(cell, { kind: 'default', ...place(path, id) });
        marks(block.content, path, id);
      } else {
        visitList(block, path, id, true);
      }
    };

    const visit = (block: Block | ListItemBlock, path: string, inList: boolean): void => {
      const id = block.id;
      const kind: UseKind = block.style === undefined ? 'default' : 'direct';
      switch (block.type) {
        case 'heading':
          paragraphs.add(block.style ?? defaultHeadingStyle(block.level), {
            kind,
            ...place(path, id),
          });
          marks(block.content, path, id);
          break;
        case 'paragraph':
          if (block.style !== undefined || !inList) {
            paragraphs.add(block.style ?? BODY_STYLE, { kind, ...place(path, id) });
          }
          marks(block.content, path, id);
          break;
        case 'list':
          visitList(block, path, id, false);
          break;
        case 'table': {
          const style = block.style ?? RESERVED_TABLE_STYLE;
          tables.add(style, { kind, ...place(path, id) });
          const cell = resolveTableStyle(stylesheet, style)?.cellStyle ?? BODY_STYLE;
          for (const row of [block.header, ...block.rows]) {
            for (const { blocks } of row) {
              for (const inner of blocks) visitCell(inner, path, id, cell);
            }
          }
          break;
        }
        case 'code':
          paragraphs.add(block.style ?? CODE_STYLE, { kind, ...place(path, id) });
          break;
        case 'stanza':
          if (block.kind === TOC_STANZA_KIND) {
            const { depth } = readTocOptions(block.text).options;
            for (let level = 1; level <= depth; level += 1) {
              paragraphs.add(tocStyleName(level), { kind: 'default', ...place(path, id) });
            }
          }
          break;
      }
    };

    document.blocks.forEach((block, index) => {
      visit(block, `blocks[${String(index)}]`, false);
    });
  }

  return {
    paragraphStyles: paragraphs.byStyle,
    characterStyles: characters.byStyle,
    tableStyles: tables.byStyle,
  };
}
