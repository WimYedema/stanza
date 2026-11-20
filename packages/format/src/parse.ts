import {
  isStyleName,
  normalizeInlines,
  plainCell,
  plainCellInlines,
  type Block,
  type CellBlock,
  type Diagnostic,
  type Document,
  type DocumentMeta,
  type HeadingLevel,
  type Inline,
  type List,
  type ListItem,
  type ListItemBlock,
  type Mark,
  type TableCell,
  type Text,
} from '@stanza/core';
import MarkdownIt, { type Token } from 'markdown-it';
import { parseAnnotation, type Annotation } from './annotation.js';
import { FORMAT_VERSION, parseFrontMatter, splitFrontMatter } from './front-matter.js';
import { LEGACY_FORMAT_CODE } from './legacy.js';

export interface ParseResult {
  readonly document: Document;
  readonly diagnostics: readonly Diagnostic[];
  /** The `stanza-format` value found in the file, when there was one. */
  readonly formatVersion: number | undefined;
}

// Reference-style links are not part of the dialect, so `[text]` stays plain text.
const markdown = new MarkdownIt('commonmark', { html: true }).enable('table').disable('reference');

const HEADING_LEVELS: Record<string, HeadingLevel> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
const SPAN_OPEN = /^<span class="([^"]*)">$/;

interface State {
  readonly tokens: readonly Token[];
  pos: number;
  readonly diagnostics: Diagnostic[];
  /** Number of source lines before the Markdown body, for diagnostics. */
  readonly lineOffset: number;
}

function report(
  state: State,
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  token?: Token,
): void {
  const line = (token?.map?.[0] ?? 0) + state.lineOffset + 1;
  state.diagnostics.push({ severity, code, message, line });
}

function isListItemBlock(block: Block): block is ListItemBlock {
  return block.type !== 'heading';
}

const EMPTY_META: DocumentMeta = { fields: {} };

/** Reads a Stanza document. Anything that cannot be represented is reported, never dropped silently. */
export function parseDocument(source: string): ParseResult {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const diagnostics: Diagnostic[] = [];

  const { yaml, lineCount } = splitFrontMatter(lines);
  let meta = EMPTY_META;
  let formatVersion: number | undefined;
  if (yaml === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'front-matter-missing',
      message: 'The file must start with front matter containing "stanza-format".',
      line: 1,
    });
  } else {
    const front = parseFrontMatter(yaml, diagnostics, 1);
    meta = front.meta;
    formatVersion = front.formatVersion;
    if (
      formatVersion === undefined &&
      !diagnostics.some((d) => d.code.startsWith('front-matter') || d.code === LEGACY_FORMAT_CODE)
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'format-version-missing',
        message: 'Front matter must contain "stanza-format".',
        line: 1,
      });
    }
  }
  if (formatVersion !== undefined && formatVersion !== FORMAT_VERSION) {
    diagnostics.push({
      severity: 'error',
      code: 'format-version-unsupported',
      message: `Format version ${String(formatVersion)} is not supported (expected ${String(FORMAT_VERSION)}).`,
      line: 1,
    });
  }

  const body = lines.slice(lineCount).join('\n');
  const blocks = parseMarkdownBlocks(body, markdown, {}, lineCount, diagnostics);
  return { document: { meta, blocks }, diagnostics, formatVersion };
}

/**
 * Reads the Markdown of a body into blocks, adding what it cannot represent to `diagnostics`. The
 * caller chooses the Markdown rules and gets the parser's environment back (ADR 0060).
 */
export function parseMarkdownBlocks(
  body: string,
  md: InstanceType<typeof MarkdownIt>,
  env: Record<string, unknown>,
  lineOffset: number,
  diagnostics: Diagnostic[],
): Block[] {
  const state: State = { tokens: md.parse(body, env), pos: 0, diagnostics, lineOffset };
  return parseBlocks(state, undefined, true);
}

/**
 * The line on which each top-level block starts, counted from 1 in the whole file, in the order of
 * the blocks that `parseDocument` gives. The annotation line before a block belongs to the block.
 * It is for finding the block of a line, for example from a link that names one (ADR 0063).
 */
export function blockStartLines(source: string): number[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const { lineCount } = splitFrontMatter(text.split('\n'));
  const starts: number[] = [];
  let annotated: number | undefined;
  for (const token of markdown.parse(text.split('\n').slice(lineCount).join('\n'), {})) {
    if (token.level !== 0 || token.nesting === -1 || token.map === null) continue;
    const line = token.map[0] + lineCount + 1;
    if (token.type === 'html_block') {
      if (parseAnnotation(token.content, line) !== undefined) annotated = line;
    } else if (token.type !== 'hr' && token.type !== 'blockquote_open') {
      starts.push(annotated ?? line);
      annotated = undefined;
    }
  }
  return starts;
}

function parseBlocks(state: State, closeType: string | undefined, allowHeading: boolean): Block[] {
  const blocks: Block[] = [];
  let pending: { annotation: Annotation; token: Token } | undefined;

  const emit = (block: Block): void => {
    blocks.push(pending === undefined ? block : annotate(state, block, pending));
    pending = undefined;
  };

  for (;;) {
    const token = state.tokens[state.pos];
    if (token === undefined) break;
    if (token.nesting === -1) {
      state.pos += 1;
      if (token.type === closeType) break;
      continue;
    }

    switch (token.type) {
      case 'html_block': {
        state.pos += 1;
        const parsed = parseAnnotation(token.content, (token.map?.[0] ?? 0) + state.lineOffset + 1);
        if (parsed === undefined) {
          report(state, 'warning', 'html-unsupported', 'HTML blocks are not supported.', token);
        } else {
          state.diagnostics.push(...parsed.diagnostics);
          if (pending !== undefined) {
            report(state, 'warning', 'annotation-unused', 'Annotation without a block.', token);
          }
          pending = { annotation: parsed.annotation, token };
        }
        break;
      }
      case 'heading_open': {
        const content = inlineRuns(state, state.tokens[state.pos + 1], token);
        state.pos += 3;
        if (allowHeading) {
          emit({ type: 'heading', level: HEADING_LEVELS[token.tag] ?? 1, content });
        } else {
          report(state, 'warning', 'heading-in-list', 'Headings are not allowed here.', token);
          emit({ type: 'paragraph', content });
        }
        break;
      }
      case 'paragraph_open': {
        const content = inlineRuns(state, state.tokens[state.pos + 1], token);
        state.pos += 3;
        emit({ type: 'paragraph', content });
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open':
        emit(parseList(state, token));
        break;
      case 'table_open':
        emit(parseTable(state, token));
        break;
      case 'fence':
        state.pos += 1;
        emit(fenceBlock(state, token));
        break;
      case 'code_block':
        state.pos += 1;
        emit({ type: 'code', text: token.content.replace(/\n$/, '') });
        break;
      case 'blockquote_open':
        state.pos += 1;
        report(
          state,
          'warning',
          'blockquote-unsupported',
          'Block quotes are not supported; the content is kept as ordinary blocks.',
          token,
        );
        blocks.push(...parseBlocks(state, 'blockquote_close', allowHeading));
        break;
      case 'hr':
        state.pos += 1;
        report(
          state,
          'error',
          'thematic-break-unsupported',
          'Thematic breaks are not supported.',
          token,
        );
        break;
      default:
        report(state, 'error', 'unsupported-block', `Unsupported block "${token.type}".`, token);
        skipContainer(state);
    }
  }

  if (pending !== undefined) {
    report(state, 'warning', 'annotation-unused', 'Annotation without a block.', pending.token);
  }
  return blocks;
}

function skipContainer(state: State): void {
  let depth = 0;
  do {
    depth += state.tokens[state.pos]?.nesting ?? 0;
    state.pos += 1;
  } while (depth > 0 && state.pos < state.tokens.length);
}

function identify<T extends Block>(block: T, annotation: Annotation): T {
  return {
    ...block,
    ...(annotation.id !== undefined ? { id: annotation.id } : {}),
    ...(annotation.style !== undefined ? { style: annotation.style } : {}),
  };
}

function annotate(
  state: State,
  block: Block,
  pending: { annotation: Annotation; token: Token },
): Block {
  const { annotation, token } = pending;
  if (annotation.widths === undefined) return identify(block, annotation);
  if (block.type !== 'table') {
    report(state, 'warning', 'widths-not-table', 'Widths apply to tables only.', token);
    return identify(block, annotation);
  }
  if (annotation.widths.length !== block.header.length) {
    report(
      state,
      'warning',
      'widths-mismatch',
      'The number of widths differs from the number of columns.',
      token,
    );
    return identify(block, annotation);
  }
  return { ...identify(block, annotation), widths: annotation.widths };
}

function parseList(state: State, open: Token): Block {
  const kind = open.type === 'bullet_list_open' ? 'bulleted' : 'numbered';
  const start = open.attrGet('start');
  if (start !== null && Number(start) !== 1) {
    report(
      state,
      'warning',
      'list-start-unsupported',
      'List start numbers are not supported.',
      open,
    );
  }
  state.pos += 1;
  const items: ListItem[] = [];
  while (state.tokens[state.pos]?.type === 'list_item_open') {
    state.pos += 1;
    items.push({ blocks: parseBlocks(state, 'list_item_close', false).filter(isListItemBlock) });
  }
  state.pos += 1; // the list's closing token
  return { type: 'list', kind, items };
}

function parseTable(state: State, open: Token): Block {
  state.pos += 1;
  const header: TableCell[][] = [];
  const rows: TableCell[][] = [];
  let inHead = false;
  let current: TableCell[] | undefined;
  let aligned = false;

  while (state.pos < state.tokens.length) {
    const token = state.tokens[state.pos];
    state.pos += 1;
    if (token === undefined || token.type === 'table_close') break;
    switch (token.type) {
      case 'thead_open':
        inHead = true;
        break;
      case 'thead_close':
        inHead = false;
        break;
      case 'tr_open':
        current = [];
        break;
      case 'tr_close':
        if (current !== undefined) (inHead ? header : rows).push(current);
        current = undefined;
        break;
      case 'th_open':
      case 'td_open':
        if (token.attrGet('style') !== null) aligned = true;
        current?.push(plainCell(inlineRuns(state, state.tokens[state.pos], token)));
        state.pos += 2; // the inline token and the cell's closing token
        break;
    }
  }

  if (aligned) {
    report(
      state,
      'warning',
      'table-alignment-unsupported',
      'Column alignment is not supported.',
      open,
    );
  }
  const columns = header[0]?.length ?? 0;
  // The Markdown parser already drops cells beyond the header, as GitHub does.
  const fit = (row: TableCell[]): TableCell[] =>
    Array.from({ length: columns }, (_, i) => row[i] ?? plainCell([]));
  return { type: 'table', header: fit(header[0] ?? []), rows: rows.map(fit) };
}

function fenceBlock(state: State, token: Token): Block {
  const [first = '', ...rest] = token.info.trim().split(/\s+/);
  const text = token.content.replace(/\n$/, '');
  if (rest.length > 0) {
    report(
      state,
      'warning',
      'fence-info-ignored',
      `Ignored "${rest.join(' ')}" after the fence language.`,
      token,
    );
  }
  if (first === 'stanza-table') return parseStanzaTable(state, token, text);
  if (first.startsWith('stanza-')) {
    const kind = first.slice('stanza-'.length);
    if (kind === '')
      report(state, 'error', 'stanza-block-kind-missing', 'A stanza block needs a kind.', token);
    return { type: 'stanza', kind, text };
  }
  return first === '' ? { type: 'code', text } : { type: 'code', language: first, text };
}

const isPlainBulletList = (block: Block | undefined): block is List =>
  block?.type === 'list' &&
  block.kind === 'bulleted' &&
  block.id === undefined &&
  block.style === undefined;

function cellOf(state: State, fence: Token, blocks: readonly ListItemBlock[]): TableCell {
  const kept = blocks.filter(
    (block): block is CellBlock => block.type === 'paragraph' || block.type === 'list',
  );
  if (kept.length < blocks.length) {
    report(
      state,
      'error',
      'table-cell-block',
      'A table cell holds paragraphs and lists only.',
      fence,
    );
  }
  return { blocks: kept };
}

/**
 * The body of a `stanza-table` (ADR 0048): a bullet list of rows, each a bullet list of cells, each
 * cell holding blocks. The first row is the header. The levels count by position, so a list in a
 * cell does not clash with the rows and cells. Rows of different length are left for the checks of
 * the document to report.
 */
function parseStanzaTable(state: State, fence: Token, text: string): Block {
  const body: State = {
    tokens: markdown.parse(text, {}),
    pos: 0,
    diagnostics: state.diagnostics,
    lineOffset: state.lineOffset + (fence.map?.[0] ?? 0) + 1,
  };
  const invalid = (message: string): Block => {
    report(state, 'error', 'invalid-table-body', message, fence);
    return { type: 'table', header: [], rows: [] };
  };
  const [rowList, ...others] = parseBlocks(body, undefined, false);
  if (!isPlainBulletList(rowList) || others.length > 0) {
    return invalid(
      'The body of a stanza-table must be one bullet list of rows, as in "- - first cell".',
    );
  }
  const rows: TableCell[][] = [];
  for (const [index, row] of rowList.items.entries()) {
    const [cells, ...more] = row.blocks;
    if (!isPlainBulletList(cells) || more.length > 0) {
      return invalid(
        `Row ${String(index + 1)} of a stanza-table must be a bullet list of cells, as in "- - first cell".`,
      );
    }
    rows.push(cells.items.map((item) => cellOf(state, fence, item.blocks)));
  }
  const [header = [], ...rest] = rows;
  return { type: 'table', header, rows: rest };
}

function inlineRuns(state: State, token: Token | undefined, block: Token): readonly Inline[] {
  const runs: Text[] = [];
  const marks: Mark[] = [];
  const add = (text: string, extra?: Mark): void => {
    runs.push({ type: 'text', text, marks: extra === undefined ? [...marks] : [...marks, extra] });
  };
  const pop = (type: Mark['type']): void => {
    const index = marks.map((m) => m.type).lastIndexOf(type);
    if (index !== -1) marks.splice(index, 1);
  };

  for (const child of token?.children ?? []) {
    switch (child.type) {
      case 'text':
      case 'text_special':
        add(child.content);
        break;
      case 'code_inline':
        add(child.content, { type: 'code' });
        break;
      case 'softbreak':
        add(' ');
        break;
      case 'hardbreak':
        report(
          state,
          'warning',
          'hard-break-unsupported',
          'Hard line breaks are not supported; replaced by a space.',
          block,
        );
        add(' ');
        break;
      case 'strong_open':
        marks.push({ type: 'strong' });
        break;
      case 'em_open':
        marks.push({ type: 'emphasis' });
        break;
      case 'strong_close':
        pop('strong');
        break;
      case 'em_close':
        pop('emphasis');
        break;
      case 'link_open':
        marks.push({ type: 'link', href: String(child.attrGet('href') ?? '') });
        if (child.attrGet('title') !== null) {
          report(
            state,
            'warning',
            'link-title-unsupported',
            'Link titles are not supported.',
            block,
          );
        }
        break;
      case 'link_close':
        pop('link');
        break;
      case 'image':
        report(
          state,
          'warning',
          'image-unsupported',
          'Images are not supported; the alt text is kept.',
          block,
        );
        add(child.content);
        break;
      case 'html_inline':
        inlineHtml(state, child, block, marks);
        break;
      default:
        report(
          state,
          'warning',
          'unsupported-inline',
          `Unsupported inline "${child.type}".`,
          block,
        );
    }
  }
  return normalizeInlines(runs);
}

/** `<strong>` and `<em>` are how the serializer writes emphasis that `*` delimiters cannot express. */
const MARK_TAGS: Record<string, { open: Mark; type: Mark['type'] } | undefined> = {
  '<strong>': { open: { type: 'strong' }, type: 'strong' },
  '<em>': { open: { type: 'emphasis' }, type: 'emphasis' },
};
const CLOSING_TAGS: Record<string, Mark['type'] | undefined> = {
  '</span>': 'style',
  '</strong>': 'strong',
  '</em>': 'emphasis',
};

function inlineHtml(state: State, child: Token, block: Token, marks: Mark[]): void {
  const open = SPAN_OPEN.exec(child.content)?.[1];
  const tag = MARK_TAGS[child.content];
  const closing = CLOSING_TAGS[child.content];
  if (open !== undefined && isStyleName(open)) {
    marks.push({ type: 'style', name: open });
  } else if (tag !== undefined) {
    marks.push(tag.open);
  } else if (closing !== undefined) {
    const index = marks.map((m) => m.type).lastIndexOf(closing);
    if (index !== -1) marks.splice(index, 1);
  } else {
    report(
      state,
      'warning',
      'inline-html-unsupported',
      `Unsupported inline HTML ${child.content}.`,
      block,
    );
  }
}

/**
 * Reads the inline content of one block written in the given context. The serializer uses this to
 * check that what it wrote reads back unchanged.
 */
export function parseInlineText(
  text: string,
  context: 'paragraph' | 'heading' | 'cell',
): readonly Inline[] | undefined {
  const source =
    context === 'heading' ? `# ${text}` : context === 'cell' ? `| h |\n| --- |\n| ${text} |` : text;
  const state: State = {
    tokens: markdown.parse(source, {}),
    pos: 0,
    diagnostics: [],
    lineOffset: 0,
  };
  const block = parseBlocks(state, undefined, true)[0];
  if (block?.type === 'heading' || block?.type === 'paragraph') return block.content;
  return block?.type === 'table' && block.rows[0]?.[0] !== undefined
    ? plainCellInlines(block.rows[0][0])
    : undefined;
}
