import {
  isStyleName,
  resolveParagraphStyle,
  type Block,
  type CodeBlock,
  type Diagnostic,
  type Heading,
  type Inline,
  type LinkMark,
  type Paragraph as ParagraphBlock,
  type StyleName,
  type Stylesheet,
} from '@phrase/core';
import { ExternalHyperlink, Paragraph, Tab, TextRun, type ParagraphChild } from 'docx';
import type { RunStyles } from './run-styles.js';
import { wordStyleId } from './style-ids.js';

export interface BuildContext {
  readonly stylesheet: Stylesheet;
  readonly runs: RunStyles;
  readonly diagnostics: Diagnostic[];
}

function styleName(value: string): StyleName {
  if (!isStyleName(value)) throw new Error(`Invalid style name "${value}".`);
  return value;
}

const BODY = styleName('body');
const CODE = styleName('code');

/** The text of a run, with tab characters written as Word tabs. */
function textChildren(text: string): (string | Tab)[] {
  return text.split('\t').flatMap((part, index) => (index === 0 ? [part] : [new Tab(), part]));
}

function linkOf(inline: Inline | undefined): LinkMark | undefined {
  return inline?.marks.find((mark): mark is LinkMark => mark.type === 'link');
}

function inlineChildren(
  content: readonly Inline[],
  style: StyleName,
  context: BuildContext,
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  let index = 0;
  while (index < content.length) {
    const link = linkOf(content[index]);
    // Consecutive runs that share a link target belong to one hyperlink.
    let end = index + 1;
    while (link !== undefined && linkOf(content[end])?.href === link.href) end += 1;
    const runs = content.slice(index, end).map(
      (inline) =>
        new TextRun({
          children: textChildren(inline.text),
          ...context.runs.format(style, inline.marks),
        }),
    );
    if (link === undefined) children.push(...runs);
    else children.push(new ExternalHyperlink({ link: link.href, children: runs }));
    index = end;
  }
  return children;
}

function paragraphOf(
  style: StyleName,
  children: ParagraphChild[],
  context: BuildContext,
): Paragraph {
  const pageBreakBefore = resolveParagraphStyle(context.stylesheet, style)?.paragraph
    .pageBreakBefore;
  return new Paragraph({
    style: wordStyleId(style),
    children,
    ...(pageBreakBefore === true ? { pageBreakBefore } : {}),
  });
}

function textBlock(block: Heading | ParagraphBlock, context: BuildContext): Paragraph {
  const style =
    block.style ?? (block.type === 'heading' ? styleName(`heading-${String(block.level)}`) : BODY);
  return paragraphOf(style, inlineChildren(block.content, style, context), context);
}

function codeBlock(block: CodeBlock, context: BuildContext): Paragraph {
  const style = block.style ?? CODE;
  const runs = block.text
    .split('\n')
    .map(
      (line, index) =>
        new TextRun({ children: textChildren(line), ...(index > 0 ? { break: 1 } : {}) }),
    );
  return paragraphOf(style, runs, context);
}

/** Maps the blocks of a document. Blocks that cannot be mapped yet are reported and left out. */
export function buildBlocks(blocks: readonly Block[], context: BuildContext): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  blocks.forEach((block, index) => {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        paragraphs.push(textBlock(block, context));
        break;
      case 'code':
        paragraphs.push(codeBlock(block, context));
        break;
      case 'list':
      case 'table':
      case 'phrase':
        context.diagnostics.push({
          severity: 'error',
          code: 'docx-unsupported-block',
          message: `The DOCX export does not support ${block.type} blocks yet.`,
          path: `blocks[${String(index)}]`,
          ...(block.id !== undefined ? { nodeId: block.id } : {}),
        });
        break;
    }
  });
  return paragraphs;
}
