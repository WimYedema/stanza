import {
  TOC_PHRASE_KIND,
  maxHeadingLevel,
  normalizeInlines,
  type Block,
  type HeadingLevel,
  type Paragraph,
  type Text,
} from '@phrase/core';
import type { ImportContext } from './context.js';
import { BlockWriter, paragraphNumbering } from './block-writer.js';
import { readParagraph } from './paragraph.js';
import { importTable } from './table.js';
import { toggleOf } from './styles.js';
import { childOf, elementsOf, type XmlElement } from './xml.js';

/** Paragraph properties that carry no look, or that the import reads. Everything else is direct formatting. */
const READ_OR_NEUTRAL_PARAGRAPH_PROPERTIES = new Set([
  'pStyle',
  'numPr',
  'rPr',
  'sectPr',
  'pPrChange',
  'keepNext',
  'keepLines',
  'widowControl',
  'pageBreakBefore',
  'outlineLvl',
  'contextualSpacing',
]);

const TYPED_NUMBER = /^\d+(\.\d+)*[.)]?\s/;
const MAX_HEADING_PLACE = 60;

const textOf = (inlines: readonly Text[]): string => inlines.map((inline) => inline.text).join('');

export function convertBody(body: XmlElement, ctx: ImportContext): Block[] {
  const writer = new BlockWriter();
  const referenced = new Set<string>();
  let lastHeading: HeadingLevel | undefined;
  let carried:
    { inlines: Text[]; extras: Paragraph[]; properties: XmlElement | undefined } | undefined;

  const section = (properties: XmlElement, isBreak: boolean): void => {
    if (isBreak) ctx.report.add('section-break', ctx.place());
    for (const reference of elementsOf(properties)) {
      if (reference.name !== 'headerReference' && reference.name !== 'footerReference') continue;
      const id = reference.attrs['id'];
      if (id !== undefined && !referenced.has(id)) {
        referenced.add(id);
        ctx.report.add('header-footer');
      }
    }
  };

  const numberingOf = paragraphNumbering.bind(undefined, ctx);

  const emit = (
    properties: XmlElement | undefined,
    inlines: Text[],
    extras: Paragraph[],
    inToc: boolean,
  ): void => {
    const styleId = childOf(properties, 'pStyle')?.attrs['val'];
    const content = normalizeInlines(inlines);
    if (content.length === 0) {
      if (extras.length === 0 && !inToc) ctx.report.add('empty-paragraph', ctx.place());
      for (const extra of extras) writer.push(extra);
      return;
    }
    const word = ctx.styles.nameOf(styleId);
    const heading = ctx.styles.headingLevel(styleId);
    const numbering = numberingOf(properties, styleId);
    if (heading !== undefined) {
      ctx.report.useStyle(word, `heading-${String(heading)}`);
      const text = textOf(content);
      ctx.heading = text.slice(0, MAX_HEADING_PLACE);
      if (heading > maxHeadingLevel(lastHeading)) ctx.report.add('heading-level-skip', ctx.place());
      if (numbering !== undefined || TYPED_NUMBER.test(text))
        ctx.report.add('heading-number', ctx.place());
      lastHeading = heading;
      writer.push({ type: 'heading', level: heading, content });
      for (const extra of extras) writer.push(extra);
    } else if (numbering !== undefined) {
      ctx.report.useStyle(word, 'list item');
      let kind = ctx.numbering.kindOf(numbering.numId, numbering.level);
      if (kind === undefined) {
        ctx.report.add('unknown-numbering', ctx.place());
        kind = 'bulleted';
      }
      writer.addItem(kind, numbering.numId, numbering.level, content, extras);
    } else {
      ctx.report.useStyle(word, 'body');
      writer.push({ type: 'paragraph', content });
      for (const extra of extras) writer.push(extra);
    }
  };

  const paragraph = (element: XmlElement): void => {
    const properties = childOf(element, 'pPr');
    const tocBefore = ctx.tocOpen();
    const read = readParagraph(element, ctx);
    const toc = ctx.pendingToc;
    ctx.pendingToc = undefined;
    // The paragraphs of a table of contents field are not content of their own.
    const inToc = tocBefore || toc !== undefined;
    const sectionProperties = childOf(properties, 'sectPr');
    if (sectionProperties !== undefined) section(sectionProperties, true);
    if (toggleOf(properties, 'pageBreakBefore') === true) ctx.report.add('page-break', ctx.place());
    if (
      !inToc &&
      elementsOf(properties).some(
        (property) => !READ_OR_NEUTRAL_PARAGRAPH_PROPERTIES.has(property.name),
      )
    ) {
      ctx.report.add('direct-formatting', ctx.place());
    }
    const inlines = [...(carried?.inlines ?? []), ...read.inlines];
    const extras = [...(carried?.extras ?? []), ...read.extras];
    carried = undefined;
    if (read.markDeleted) carried = { inlines, extras, properties };
    else emit(properties, inlines, extras, inToc);
    if (toc !== undefined) {
      const text = toc.depth === undefined ? '' : `depth: ${String(toc.depth)}`;
      writer.push({ type: 'phrase', kind: TOC_PHRASE_KIND, text });
      ctx.report.add('toc-field', ctx.place());
    }
  };

  const flushCarried = (): void => {
    if (carried === undefined) return;
    const { inlines, extras, properties } = carried;
    carried = undefined;
    emit(properties, inlines, extras, false);
  };

  const visit = (container: XmlElement): void => {
    for (const node of elementsOf(container)) {
      switch (node.name) {
        case 'p':
          paragraph(node);
          break;
        case 'tbl':
          flushCarried();
          for (const block of importTable(node, ctx)) writer.push(block);
          break;
        case 'sdt': {
          const inner = childOf(node, 'sdtContent');
          if (inner !== undefined) visit(inner);
          break;
        }
        case 'customXml':
        case 'ins':
        case 'moveTo':
          visit(node);
          break;
        case 'sectPr':
          section(node, false);
          break;
        case 'bookmarkStart':
          ctx.report.add('bookmark');
          break;
        default:
          break;
      }
    }
  };

  visit(body);
  flushCarried();
  return writer.blocks;
}
