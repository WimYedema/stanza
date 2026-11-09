import {
  isNodeId,
  isStyleName,
  normalizeDocument,
  plainCell,
  plainCellInlines,
  type Block,
  type Diagnostic,
  type Document,
  type DocumentMeta,
  type HeadingLevel,
  type Inline,
  type List,
  type ListItemBlock,
  type Mark,
  type NodeId,
  type StyleName,
  type Table,
  type TableCell,
} from '@phrase/core';
import type { JSONContent } from '@tiptap/core';
import type { Mark as EditorMark, Node as EditorNode } from '@tiptap/pm/model';

/**
 * Conversion between the domain model and the content of the editor (ADR 0022). Both directions are
 * pure and need no DOM. The editor is authoritative while a document is open, so what comes back
 * is checked at this boundary, and anything that the model cannot hold is reported and not
 * repaired.
 */

type Attrs = Record<string, unknown>;

interface BlockBase {
  readonly id?: NodeId;
  readonly style?: StyleName;
}

const attributes = (block: BlockBase, extra: Attrs = {}): Attrs => ({
  ...(block.id !== undefined ? { id: block.id } : {}),
  ...(block.style !== undefined ? { style: block.style } : {}),
  ...extra,
});

function markJson(mark: Mark): NonNullable<JSONContent['marks']>[number] {
  switch (mark.type) {
    case 'link':
      return { type: 'link', attrs: { href: mark.href } };
    case 'style':
      return { type: 'style', attrs: { name: mark.name } };
    default:
      return { type: mark.type };
  }
}

const inlinesJson = (inlines: readonly Inline[]): JSONContent[] =>
  inlines
    // An empty text node cannot exist in the editor.
    .filter((inline) => inline.text !== '')
    .map((inline) => ({
      type: 'text',
      text: inline.text,
      ...(inline.marks.length > 0 ? { marks: inline.marks.map(markJson) } : {}),
    }));

const cellJson = (type: 'tableHeader' | 'tableCell', cell: TableCell): JSONContent => {
  const inlines = plainCellInlines(cell);
  // The cells of the editor hold inline text until the editor item of ADR 0048.
  if (inlines === undefined)
    throw new Error('The editor cannot show a table cell with more than text yet.');
  return { type, content: inlinesJson(inlines) };
};

function tableJson(table: Table): JSONContent {
  const rows: JSONContent[] = [];
  if (table.header.length > 0) {
    rows.push({ type: 'tableRow', content: table.header.map((c) => cellJson('tableHeader', c)) });
  }
  for (const row of table.rows) {
    rows.push({ type: 'tableRow', content: row.map((c) => cellJson('tableCell', c)) });
  }
  return {
    type: 'table',
    attrs: attributes(table, table.widths !== undefined ? { widths: [...table.widths] } : {}),
    content: rows,
  };
}

function listJson(list: List): JSONContent {
  return {
    type: list.kind === 'bulleted' ? 'bulletList' : 'orderedList',
    attrs: attributes(list),
    content: list.items.map((item) => ({
      type: 'listItem',
      content: item.blocks.map(itemBlockJson),
    })),
  };
}

function itemBlockJson(block: ListItemBlock): JSONContent {
  switch (block.type) {
    case 'paragraph':
      return { type: 'paragraph', attrs: attributes(block), content: inlinesJson(block.content) };
    case 'list':
      return listJson(block);
    case 'table':
      return tableJson(block);
    case 'code':
      return {
        type: 'codeBlock',
        attrs: attributes(block, block.language !== undefined ? { language: block.language } : {}),
        content: block.text === '' ? [] : [{ type: 'text', text: block.text }],
      };
    case 'phrase':
      return {
        type: 'phraseBlock',
        attrs: attributes(block, { kind: block.kind, text: block.text }),
      };
  }
}

function blockJson(block: Block): JSONContent {
  if (block.type !== 'heading') return itemBlockJson(block);
  return {
    type: 'heading',
    attrs: attributes(block, { level: block.level }),
    content: inlinesJson(block.content),
  };
}

/** The content of the editor for a document. The metadata is not part of it. */
export function toEditorContent(document: Document): JSONContent {
  return { type: 'doc', content: document.blocks.map(blockJson) };
}

export interface FromEditorResult {
  /** Undefined when something could not be turned into the model. */
  readonly document: Document | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

class Reader {
  readonly diagnostics: Diagnostic[] = [];

  private problem(message: string, path: string): void {
    this.diagnostics.push({ severity: 'error', code: 'editor-invalid-content', message, path });
  }

  private optionalString(node: EditorNode, name: string, path: string): string | undefined {
    const value: unknown = node.attrs[name];
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value;
    this.problem(`The attribute "${name}" must be a string.`, path);
    return undefined;
  }

  private base(node: EditorNode, path: string): BlockBase {
    const id = this.optionalString(node, 'id', path);
    const style = this.optionalString(node, 'style', path);
    if (id !== undefined && !isNodeId(id)) this.problem(`"${id}" is not an ID.`, path);
    if (style !== undefined && !isStyleName(style)) {
      this.problem(`"${style}" is not a style name.`, path);
    }
    return {
      ...(id !== undefined && isNodeId(id) ? { id } : {}),
      ...(style !== undefined && isStyleName(style) ? { style } : {}),
    };
  }

  private mark(mark: EditorMark, path: string): Mark | undefined {
    const name = mark.type.name;
    const value: unknown = mark.attrs[name === 'link' ? 'href' : 'name'];
    switch (name) {
      case 'strong':
      case 'emphasis':
      case 'code':
        return { type: name };
      case 'link':
        if (typeof value === 'string') return { type: 'link', href: value };
        this.problem('A link needs a target.', path);
        return undefined;
      case 'style':
        if (typeof value === 'string' && isStyleName(value)) return { type: 'style', name: value };
        this.problem('A character style needs a valid style name.', path);
        return undefined;
      default:
        this.problem(`The mark "${name}" is not part of the document.`, path);
        return undefined;
    }
  }

  private inlines(node: EditorNode, path: string): Inline[] {
    const result: Inline[] = [];
    node.forEach((child) => {
      if (child.type.name !== 'text') {
        this.problem(`"${child.type.name}" cannot be inline content.`, path);
        return;
      }
      const marks = child.marks.flatMap((mark) => this.mark(mark, path) ?? []);
      result.push({ type: 'text', text: child.text ?? '', marks });
    });
    return result;
  }

  private widths(node: EditorNode, path: string): readonly number[] | undefined {
    const value: unknown = node.attrs['widths'];
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value) && value.every((w) => typeof w === 'number' && w > 0)) {
      return value as number[];
    }
    this.problem('The column widths must be a list of positive numbers.', path);
    return undefined;
  }

  private cell(node: EditorNode, path: string): TableCell {
    // Merged cells cannot be written down in the document.
    if (node.attrs['colspan'] !== 1 || node.attrs['rowspan'] !== 1) {
      this.problem('A table cell cannot span several columns or rows.', path);
    }
    return plainCell(this.inlines(node, path));
  }

  private table(node: EditorNode, path: string): Table {
    const rows: EditorNode[] = [];
    node.forEach((row) => rows.push(row));
    const [first, ...rest] = rows;
    const isHeader = (row: EditorNode): boolean => {
      let all = row.childCount > 0;
      row.forEach((cell) => {
        if (cell.type.name !== 'tableHeader') all = false;
      });
      return all;
    };
    const header = first !== undefined && isHeader(first) ? first : undefined;
    const body = header === undefined ? rows : rest;
    const read = (row: EditorNode, where: string): TableCell[] => {
      const cells: TableCell[] = [];
      row.forEach((cell, _offset, column) => {
        const here = `${where}.cells[${String(column)}]`;
        if (cell.type.name === 'tableHeader' && (header === undefined || row !== header)) {
          this.problem('Only the first row of a table can have header cells.', here);
        }
        cells.push(this.cell(cell, here));
      });
      return cells;
    };
    const widths = this.widths(node, path);
    return {
      type: 'table',
      ...this.base(node, path),
      ...(widths !== undefined ? { widths } : {}),
      header: header === undefined ? [] : read(header, `${path}.header`),
      rows: body.map((row, index) => read(row, `${path}.rows[${String(index)}]`)),
    };
  }

  private list(node: EditorNode, path: string): List {
    const items: { blocks: ListItemBlock[] }[] = [];
    node.forEach((item, _offset, index) => {
      const blocks: ListItemBlock[] = [];
      item.forEach((child, _childOffset, childIndex) => {
        const here = `${path}.items[${String(index)}].blocks[${String(childIndex)}]`;
        const block = this.itemBlock(child, here);
        if (block !== undefined) blocks.push(block);
      });
      items.push({ blocks });
    });
    return {
      type: 'list',
      kind: node.type.name === 'bulletList' ? 'bulleted' : 'numbered',
      ...this.base(node, path),
      items,
    };
  }

  itemBlock(node: EditorNode, path: string): ListItemBlock | undefined {
    switch (node.type.name) {
      case 'paragraph':
        return {
          type: 'paragraph',
          ...this.base(node, path),
          content: this.inlines(node, path),
        };
      case 'bulletList':
      case 'orderedList':
        return this.list(node, path);
      case 'table':
        return this.table(node, path);
      case 'codeBlock': {
        const language = this.optionalString(node, 'language', path);
        return {
          type: 'code',
          ...this.base(node, path),
          ...(language !== undefined ? { language } : {}),
          text: node.textContent,
        };
      }
      case 'phraseBlock': {
        const kind = this.optionalString(node, 'kind', path) ?? '';
        const text = this.optionalString(node, 'text', path) ?? '';
        return { type: 'phrase', ...this.base(node, path), kind, text };
      }
      default:
        this.problem(`"${node.type.name}" is not allowed here.`, path);
        return undefined;
    }
  }

  block(node: EditorNode, path: string): Block | undefined {
    if (node.type.name !== 'heading') return this.itemBlock(node, path);
    const level: unknown = node.attrs['level'];
    const found = HEADING_LEVELS.find((candidate) => candidate === level);
    if (found === undefined) this.problem('A heading level is from 1 to 6.', path);
    return {
      type: 'heading',
      level: found ?? 1,
      ...this.base(node, path),
      content: this.inlines(node, path),
    };
  }
}

/**
 * The document for the content of the editor, in normal form (ADR 0005), with the metadata that
 * the editor does not edit. Nothing that is wrong is repaired: it is reported, and there is then
 * no document.
 */
export function fromEditorContent(root: EditorNode, meta: DocumentMeta): FromEditorResult {
  const reader = new Reader();
  const blocks: Block[] = [];
  root.forEach((node, _offset, index) => {
    const block = reader.block(node, `blocks[${String(index)}]`);
    if (block !== undefined) blocks.push(block);
  });
  if (reader.diagnostics.length > 0)
    return { document: undefined, diagnostics: reader.diagnostics };
  return { document: normalizeDocument({ meta, blocks }), diagnostics: [] };
}
