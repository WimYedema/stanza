import type { Diagnostic } from './diagnostic.js';
import {
  BODY_STYLE as BODY,
  CODE_STYLE,
  LIST_STYLES,
  defaultHeadingStyle as headingStyle,
} from './default-styles.js';
import type { Block, Document, Inline, List, ListItemBlock, Table } from './document.js';
import { numberHeadings } from './heading-numbering.js';
import type { NodeId } from './ids.js';
import type { StyleName } from './style-name.js';
import { resolveParagraphStyle, type ResolvedParagraphStyle } from './style-resolution.js';
import type { Stylesheet } from './stylesheet.js';

/** Kinds of phrase block that the exporters understand. None are defined yet. */
export const KNOWN_PHRASE_KINDS: readonly string[] = [];

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
 */
export function validateDocument(
  document: Document,
  stylesheet: Stylesheet,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report = (
    severity: Diagnostic['severity'],
    code: string,
    message: string,
    path: string,
    nodeId?: NodeId,
  ): void => {
    diagnostics.push({
      severity,
      code,
      message,
      path,
      ...(nodeId !== undefined ? { nodeId } : {}),
    });
  };

  const resolved = new Map<StyleName, ResolvedParagraphStyle | undefined>();
  const paragraphStyle = (name: StyleName): ResolvedParagraphStyle | undefined => {
    if (!resolved.has(name)) resolved.set(name, resolveParagraphStyle(stylesheet, name));
    return resolved.get(name);
  };

  const idPaths = new Map<NodeId, string>();

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
          );
        }
      }
    }
  };

  const checkTable = (table: Table, path: string, id: NodeId | undefined): void => {
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
      checkInlines(cell.content, BODY, `${path}.header[${String(index)}]`);
    });
    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, index) => {
        checkInlines(cell.content, BODY, `${path}.rows[${String(rowIndex)}][${String(index)}]`);
      });
    });
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
    } else if (block.type === 'heading' || block.type === 'table') {
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
        checkTable(block, path, block.id);
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
  diagnostics.push(...numberHeadings(document, stylesheet).diagnostics);
  return diagnostics;
}
