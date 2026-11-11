import type { Diagnostic, Fix } from './diagnostic.js';
import { needsId } from './vocabulary.js';
import {
  BODY_STYLE as BODY,
  CODE_STYLE,
  LIST_STYLES,
  defaultHeadingStyle as headingStyle,
} from './default-styles.js';
import type {
  Block,
  Document,
  Inline,
  List,
  ListItemBlock,
  PhraseBlock,
  Table,
  TableCell,
} from './document.js';
import { numberHeadings } from './heading-numbering.js';
import { isNodeId, type NodeId } from './ids.js';
import { PAGE_TEMPLATE_FIELD, resolvePageTemplate } from './page-template.js';
import { findBroken, indexReferences } from './references.js';
import type { StyleName } from './style-name.js';
import {
  resolveParagraphStyle,
  resolveTableStyle,
  type ResolvedParagraphStyle,
} from './style-resolution.js';
import { RESERVED_TABLE_STYLE, type Stylesheet } from './stylesheet.js';
import { TOC_PHRASE_KIND, readTocOptions, tocStyleName } from './toc.js';

/** Kinds of phrase block that the exporters understand. */
export const KNOWN_PHRASE_KINDS: readonly string[] = [TOC_PHRASE_KIND];

interface Context {
  /** The paragraph style that paragraphs directly inside a list item use. */
  readonly listStyle?: StyleName;
}

/**
 * Checks a document against a stylesheet and against the rules of the model: styles must exist,
 * marks must be allowed by the style they occur in, referenceable blocks need unique IDs, tables
 * must be rectangular, and phrase blocks must be of a known kind. Diagnostics point into the
 * document with a path such as `blocks[2].items[0].blocks[1]`.
 *
 * The stylesheet is assumed to have been validated. Where one of its styles is missing, the checks
 * that depend on it are skipped, not repeated for every block.
 *
 * A reference to a block is checked against the document alone, or against `projectIds`, the IDs
 * of all blocks of the project, when the document is one of several (ADR 0073).
 */
export function validateDocument(
  document: Document,
  stylesheet: Stylesheet,
  options: { readonly projectIds?: ReadonlySet<string> } = {},
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report = (
    severity: Diagnostic['severity'],
    code: string,
    message: string,
    path: string,
    nodeId?: NodeId,
    fix?: Fix,
  ): void => {
    diagnostics.push({
      severity,
      code,
      message,
      path,
      ...(nodeId !== undefined ? { nodeId } : {}),
      ...(fix !== undefined ? { fix } : {}),
    });
  };

  const resolved = new Map<StyleName, ResolvedParagraphStyle | undefined>();
  const paragraphStyle = (name: StyleName): ResolvedParagraphStyle | undefined => {
    if (!resolved.has(name)) resolved.set(name, resolveParagraphStyle(stylesheet, name));
    return resolved.get(name);
  };

  const idPaths = new Map<NodeId, string>();

  const template = document.meta.fields[PAGE_TEMPLATE_FIELD];
  if (typeof template === 'object') {
    report(
      'error',
      'field-type-mismatch',
      `The field "${PAGE_TEMPLATE_FIELD}" must be a string, not a list.`,
      PAGE_TEMPLATE_FIELD,
    );
  } else if (template !== undefined && template !== '') {
    if (resolvePageTemplate(stylesheet, template) === undefined) {
      report(
        'error',
        'unknown-page-template',
        `The page template "${template}" does not exist.`,
        PAGE_TEMPLATE_FIELD,
      );
    }
  }

  const checkNotNumbered = (style: StyleName, path: string, id: NodeId | undefined): void => {
    if (paragraphStyle(style)?.paragraph.numbered === true) {
      report(
        'warning',
        'numbering-not-applicable',
        `The style "${style}" numbers headings, so it has no effect on this block.`,
        path,
        id,
      );
    }
  };

  const checkInlines = (content: readonly Inline[], style: StyleName, path: string): void => {
    const resolvedStyle = paragraphStyle(style);
    const reported = new Set<string>();
    for (const run of content) {
      for (const mark of run.marks) {
        if (mark.type === 'style') {
          if (!stylesheet.characterStyles.has(mark.name)) {
            report(
              'error',
              'unknown-style',
              `The character style "${mark.name}" does not exist.`,
              path,
            );
          }
        } else if (
          resolvedStyle !== undefined &&
          resolvedStyle.variants[mark.type] === undefined &&
          !reported.has(mark.type)
        ) {
          reported.add(mark.type);
          report(
            'error',
            'mark-not-allowed',
            `"${mark.type}" is not offered by the style "${style}".`,
            path,
            undefined,
            { kind: 'declare-variant', style, mark: mark.type },
          );
        }
      }
    }
  };

  const checkTable = (
    table: Table,
    path: string,
    id: NodeId | undefined,
    cellStyle: StyleName,
  ): void => {
    const columns = table.header.length;
    if (columns === 0) report('error', 'table-no-columns', 'A table needs a header row.', path, id);
    table.rows.forEach((row, index) => {
      if (row.length !== columns) {
        report(
          'error',
          'table-ragged-row',
          `Row ${String(index + 1)} has ${String(row.length)} cells, the header has ${String(columns)}.`,
          `${path}.rows[${String(index)}]`,
          id,
        );
      }
    });
    if (table.widths !== undefined && table.widths.length !== columns) {
      report(
        'error',
        'table-widths-mismatch',
        `There are ${String(table.widths.length)} widths for ${String(columns)} columns.`,
        path,
        id,
      );
    }
    table.header.forEach((cell, index) => {
      checkCell(cell, cellStyle, `${path}.header[${String(index)}]`);
    });
    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, index) => {
        checkCell(cell, cellStyle, `${path}.rows[${String(rowIndex)}][${String(index)}]`);
      });
    });
  };

  // A cell holds paragraphs and lists only, and its blocks take the style of the cell (ADR 0048).
  const checkCellBlock = (block: Block | ListItemBlock, style: StyleName, path: string): void => {
    if (block.type !== 'paragraph' && block.type !== 'list') {
      report(
        'error',
        'table-cell-block',
        `A table cell holds paragraphs and lists, not ${block.type} blocks.`,
        path,
        block.id,
      );
      return;
    }
    if (block.id !== undefined || block.style !== undefined) {
      report(
        'error',
        'table-cell-block',
        'A block in a table cell takes the style of the cell and has no ID.',
        path,
        block.id,
      );
    }
    if (block.type === 'paragraph') {
      checkInlines(block.content, style, `${path}.content`);
      return;
    }
    block.items.forEach((item, itemIndex) => {
      item.blocks.forEach((child, index) => {
        checkCellBlock(
          child,
          LIST_STYLES[block.kind],
          `${path}.items[${String(itemIndex)}].blocks[${String(index)}]`,
        );
      });
    });
  };

  const checkCell = (cell: TableCell, style: StyleName, path: string): void => {
    cell.blocks.forEach((block, index) => {
      checkCellBlock(block, style, `${path}.blocks[${String(index)}]`);
    });
  };

  const checkToc = (block: PhraseBlock, path: string, nested: boolean): void => {
    const { options, diagnostics: found } = readTocOptions(block.text);
    for (const problem of found) report('error', problem.code, problem.message, path, block.id);
    if (nested) {
      report(
        'error',
        'toc-not-top-level',
        'A table of contents must be at the top level of the document.',
        path,
        block.id,
      );
    }
    for (let level = 1; level <= options.depth; level += 1) {
      const style = tocStyleName(level);
      if (!stylesheet.paragraphStyles.has(style)) {
        report(
          'error',
          'missing-toc-style',
          `The stylesheet needs the paragraph style "${style}" for a table of contents of depth ${String(options.depth)}.`,
          path,
          block.id,
        );
      }
    }
    if (!document.blocks.some((b) => b.type === 'heading' && b.level <= options.depth)) {
      report(
        'warning',
        'toc-empty',
        'No heading falls within the depth of this table of contents.',
        path,
        block.id,
      );
    }
  };

  const checkBlock = (block: Block, path: string, context: Context): void => {
    if (block.id !== undefined) {
      const first = idPaths.get(block.id);
      if (first === undefined) idPaths.set(block.id, path);
      else {
        report(
          'error',
          'duplicate-id',
          `The ID ${block.id} is also used at ${first}.`,
          path,
          block.id,
        );
      }
    } else if (needsId(block)) {
      report('warning', 'missing-id', 'This block has no ID. Assign IDs to add one.', path);
    }

    // An unknown style is reported, and the content is then checked against the default style.
    let style: StyleName | undefined;
    if (block.style !== undefined) {
      const known =
        block.type === 'table'
          ? stylesheet.tableStyles.has(block.style)
          : stylesheet.paragraphStyles.has(block.style);
      if (known) style = block.style;
      else {
        report(
          'error',
          'unknown-style',
          `The style "${block.style}" does not exist.`,
          path,
          block.id,
        );
      }
    }

    switch (block.type) {
      case 'heading':
        checkInlines(block.content, style ?? headingStyle(block.level), `${path}.content`);
        break;
      case 'paragraph':
        checkInlines(block.content, style ?? context.listStyle ?? BODY, `${path}.content`);
        // A paragraph that takes its style from the list was checked with the list.
        if (style !== undefined || context.listStyle === undefined) {
          checkNotNumbered(style ?? BODY, path, block.id);
        }
        break;
      case 'list':
        checkNotNumbered(style ?? LIST_STYLES[block.kind], path, block.id);
        checkList(block, path, style);
        break;
      case 'table':
        checkTable(
          block,
          path,
          block.id,
          resolveTableStyle(stylesheet, style ?? RESERVED_TABLE_STYLE)?.cellStyle ?? BODY,
        );
        break;
      case 'code':
        checkNotNumbered(style ?? CODE_STYLE, path, block.id);
        break;
      case 'phrase':
        if (!KNOWN_PHRASE_KINDS.includes(block.kind)) {
          report(
            'error',
            'unknown-phrase-kind',
            `The phrase block kind "${block.kind}" is not supported.`,
            path,
            block.id,
          );
        } else if (block.kind === TOC_PHRASE_KIND) {
          checkToc(block, path, context.listStyle !== undefined);
        }
        break;
    }
  };

  const checkList = (block: List, path: string, style: StyleName | undefined): void => {
    const listStyle = style ?? LIST_STYLES[block.kind];
    block.items.forEach((item, itemIndex) => {
      item.blocks.forEach((child: ListItemBlock, index) => {
        checkBlock(child, `${path}.items[${String(itemIndex)}].blocks[${String(index)}]`, {
          listStyle,
        });
      });
    });
  };

  document.blocks.forEach((block, index) => {
    checkBlock(block, `blocks[${String(index)}]`, {});
  });
  // A reference to a block that is not there is an error, never plain text (ADR 0068, 0073).
  const scope = options.projectIds === undefined ? 'this document' : 'this project';
  for (const broken of findBroken(indexReferences(document))) {
    if (options.projectIds?.has(broken.target) === true) continue;
    report(
      'error',
      'broken-reference',
      isNodeId(broken.target)
        ? `The reference "${broken.text}" points at the block ${broken.target}, which is not in ${scope}.`
        : `The link "${broken.text}" goes to "#${broken.target}", which is not the ID of a block.`,
      broken.path,
      broken.blockId,
    );
  }
  diagnostics.push(...numberHeadings(document, stylesheet).diagnostics);
  return diagnostics;
}
