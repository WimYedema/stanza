import type { Block, CellBlock, Document, Inline, ListItemBlock } from './document.js';

export interface ReferenceLink {
  /** Empty for an ID-only reference. Otherwise a URI-encoded relative document path. */
  readonly file: string;
  readonly target?: string;
}

export function parseReferenceLink(href: string): ReferenceLink | undefined {
  if (href.startsWith('#')) return { file: '', target: href.slice(1) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return undefined;
  const hash = href.indexOf('#');
  const file = hash < 0 ? href : href.slice(0, hash);
  if (!file.endsWith('.stanza.md')) return undefined;
  return { file, ...(hash < 0 ? {} : { target: href.slice(hash + 1) }) };
}

/** Resolve a link within the project, without a filesystem or a URL base. */
export function referenceFile(source: string, hint: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(hint);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
  if (decoded.startsWith('/') || decoded.includes('\\') || /[:?#\p{Cc}]/u.test(decoded)) {
    return undefined;
  }
  const parts = source.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) return undefined;
    } else if (part !== '.') {
      if (part === '') return undefined;
      parts.push(part);
    }
  }
  const file = parts.join('/');
  return file.endsWith('.stanza.md') ? file : undefined;
}

export function relativeReferenceFile(source: string, target: string): string {
  const from = source.split('/').slice(0, -1);
  const to = target.split('/');
  while (from.length > 0 && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => '..'), ...to.map(encodeURIComponent)].join('/');
}

/** Visit and optionally replace link destinations, including links inside lists and table cells. */
export function mapDocumentLinks(
  document: Document,
  map: (href: string, path: string) => string,
): Document {
  const content = (runs: readonly Inline[], path: string): readonly Inline[] =>
    runs.map((run) => ({
      ...run,
      marks: run.marks.map((mark) =>
        mark.type === 'link' ? { ...mark, href: map(mark.href, path) } : mark,
      ),
    }));
  const visit = <T extends Block | ListItemBlock | CellBlock>(block: T, path: string): T => {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        return { ...block, content: content(block.content, `${path}.content`) };
      case 'list':
        return {
          ...block,
          items: block.items.map((item, i) => ({
            blocks: item.blocks.map((child, j) =>
              visit(child, `${path}.items[${String(i)}].blocks[${String(j)}]`),
            ),
          })),
        };
      case 'table': {
        const cell = (value: (typeof block.header)[number], cellPath: string) => ({
          blocks: value.blocks.map((child, i) => visit(child, `${cellPath}.blocks[${String(i)}]`)),
        });
        return {
          ...block,
          header: block.header.map((value, i) => cell(value, `${path}.header[${String(i)}]`)),
          rows: block.rows.map((row, i) =>
            row.map((value, j) => cell(value, `${path}.rows[${String(i)}][${String(j)}]`)),
          ),
        };
      }
      default:
        return block;
    }
  };
  return {
    ...document,
    blocks: document.blocks.map((block, i) => visit(block, `blocks[${String(i)}]`)),
  };
}
