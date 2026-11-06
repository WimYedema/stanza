import { MAX_TOC_DEPTH, type Mark, type Paragraph, type Text } from '@phrase/core';
import type { ImportContext } from './context.js';
import { isMonospace, toggleOf } from './styles.js';
import { childOf, descendantsOf, elementsOf, plainText, type XmlElement } from './xml.js';

export interface ParagraphContent {
  readonly inlines: Text[];
  /** Paragraphs that follow this one: placeholders, and the text of text boxes. */
  readonly extras: Paragraph[];
  /** The paragraph mark is a tracked deletion, so the paragraph joins the next one. */
  readonly markDeleted: boolean;
}

interface Sink {
  readonly inlines: Text[];
  readonly extras: Paragraph[];
}

/** Run properties that carry no look, or that the import reads. Everything else is direct formatting. */
const READ_OR_NEUTRAL_RUN_PROPERTIES = new Set([
  'rStyle',
  'b',
  'bCs',
  'i',
  'iCs',
  'lang',
  'noProof',
  'webHidden',
  'kern',
  'cs',
  'rPrChange',
  'ins',
  'del',
  'moveFrom',
  'moveTo',
]);

const MAX_PLACEHOLDER_NAME = 80;
const SAFE_LINK = /^(https?:|mailto:|tel:)/i;

/** A placeholder paragraph: a fixed word, then what was there. */
function placeholder(kind: string, name?: string): Paragraph {
  const tidy = (name ?? '')
    .replace(/[[\]\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PLACEHOLDER_NAME);
  const text = tidy === '' ? `[${kind}]` : `[${kind}: ${tidy}]`;
  return { type: 'paragraph', content: [{ type: 'text', text, marks: [] }] };
}

/** A paragraph of plain text. */
function plainParagraph(text: string): Paragraph {
  return { type: 'paragraph', content: [{ type: 'text', text, marks: [] }] };
}

function safeLink(address: string, ctx: ImportContext): string | undefined {
  const url = address.trim();
  if (SAFE_LINK.test(url) && !/[\s\p{Cc}]/u.test(url)) return url;
  ctx.report.add('unsafe-link', ctx.place());
  return undefined;
}

/** The address that the instruction of a `HYPERLINK` field leads to. */
function fieldLink(instruction: string, ctx: ImportContext): string | undefined {
  const match = /^\s*HYPERLINK\s+([\s\S]*)$/i.exec(instruction);
  if (match === null) return undefined;
  const rest = match[1] ?? '';
  const withoutAnchor = rest.replace(/\\l\s+"[^"]*"/gi, '');
  const address =
    /"([^"]*)"/.exec(withoutAnchor)?.[1] ??
    /^\s*(?:\\\S+\s+)*([^\s\\"]\S*)/.exec(withoutAnchor)?.[1];
  if (address === undefined || address.trim() === '') {
    if (withoutAnchor !== rest) ctx.report.add('internal-link', ctx.place());
    return undefined;
  }
  return safeLink(address, ctx);
}

function hyperlinkOf(element: XmlElement, ctx: ImportContext): string | undefined {
  const id = element.attrs['id'];
  const relationship = id === undefined ? undefined : ctx.relationships.get(id);
  if (relationship?.external === true) return safeLink(relationship.target, ctx);
  if (element.attrs['anchor'] !== undefined || relationship !== undefined) {
    ctx.report.add('internal-link', ctx.place());
  }
  return undefined;
}

/** The link of the innermost field that shows its text, so that a field's text is linked. */
function linkOfFields(ctx: ImportContext): string | undefined {
  for (let index = ctx.fields.length - 1; index >= 0; index -= 1) {
    const field = ctx.fields[index];
    if (field?.showing === true && field.link !== undefined) return field.link;
  }
  return undefined;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

function readDrawing(element: XmlElement, ctx: ImportContext, sink: Sink): void {
  const frames = descendantsOf(element, 'txbxContent', 'txbxContent');
  const pictures = [
    ...descendantsOf(element, 'blip', 'txbxContent'),
    ...descendantsOf(element, 'imagedata', 'txbxContent'),
  ];
  const properties = descendantsOf(element, 'docPr', 'txbxContent')[0];
  for (const picture of pictures) {
    const reference = picture.attrs['embed'] ?? picture.attrs['link'] ?? picture.attrs['id'];
    const target = reference === undefined ? undefined : ctx.relationships.get(reference)?.target;
    const name = target === undefined ? undefined : baseName(target);
    sink.extras.push(
      placeholder('Image', name ?? properties?.attrs['descr'] ?? properties?.attrs['name']),
    );
    ctx.report.add('placeholder-image', ctx.place());
  }
  if (descendantsOf(element, 'chart', 'txbxContent').length > 0) {
    sink.extras.push(placeholder('Drawing', 'chart'));
    ctx.report.add('placeholder-drawing', ctx.place());
  } else if (pictures.length === 0 && frames.length === 0) {
    sink.extras.push(placeholder('Drawing', properties?.attrs['name']));
    ctx.report.add('placeholder-drawing', ctx.place());
  }
  for (const frame of frames) {
    ctx.report.add('text-box', ctx.place());
    readFrame(frame, ctx, sink.extras);
  }
}

/** The paragraphs in a text box, which come out after the paragraph that holds the box. */
function readFrame(frame: XmlElement, ctx: ImportContext, extras: Paragraph[]): void {
  for (const child of elementsOf(frame)) {
    if (child.name === 'p') {
      const content = readParagraph(child, ctx);
      extras.push({ type: 'paragraph', content: content.inlines }, ...content.extras);
    } else if (child.name === 'tbl') {
      ctx.report.add('table-flattened', `table after ${ctx.place()}`);
      for (const cell of descendantsOf(child, 'tc', 'tc')) {
        const text = plainText(cell);
        if (text !== '') extras.push(plainParagraph(text));
      }
    } else if (child.name === 'sdt') {
      const inner = childOf(child, 'sdtContent');
      if (inner !== undefined) readFrame(inner, ctx, extras);
    }
  }
}

function readEmbedded(element: XmlElement, ctx: ImportContext, sink: Sink): void {
  if (element.name === 'object') {
    const progId = descendantsOf(element, 'OLEObject')[0]?.attrs['ProgID'];
    sink.extras.push(placeholder('Object', progId));
    ctx.report.add('placeholder-object', ctx.place());
  } else {
    readDrawing(element, ctx, sink);
  }
}

function noteText(
  notes: ReadonlyMap<string, string>,
  element: XmlElement,
  kind: string,
  ctx: ImportContext,
): Text {
  ctx.report.add('footnote', ctx.place());
  const id = element.attrs['id'];
  const body = id === undefined ? undefined : notes.get(id);
  return { type: 'text', text: body === undefined ? `[${kind}]` : `[${kind}: ${body}]`, marks: [] };
}

function readRun(run: XmlElement, link: string | undefined, ctx: ImportContext, sink: Sink): void {
  const properties = childOf(run, 'rPr');
  const style = ctx.styles.runStyle(childOf(properties, 'rStyle')?.attrs['val']);
  const bold = toggleOf(properties, 'b') ?? style.bold ?? false;
  const italic = toggleOf(properties, 'i') ?? style.italic ?? false;
  const fontIsMonospace = isMonospace(properties);
  const code = fontIsMonospace ?? style.monospace ?? false;
  const direct = elementsOf(properties).some(
    (property) =>
      !READ_OR_NEUTRAL_RUN_PROPERTIES.has(property.name) &&
      !(property.name === 'rFonts' && fontIsMonospace === true),
  );

  let buffer = '';
  const state = { emitted: false };
  const showing = (): boolean => ctx.fields.every((field) => field.showing && !field.toc);
  const flush = (): void => {
    if (buffer === '') return;
    const marks: Mark[] = [];
    if (bold) marks.push({ type: 'strong' });
    if (italic) marks.push({ type: 'emphasis' });
    if (code) marks.push({ type: 'code' });
    const href = link ?? linkOfFields(ctx);
    if (href !== undefined) marks.push({ type: 'link', href });
    sink.inlines.push({ type: 'text', text: buffer, marks });
    buffer = '';
  };
  const add = (text: string): void => {
    buffer += text;
    state.emitted = true;
  };

  const visit = (children: readonly (XmlElement | string)[]): void => {
    for (const child of children) {
      if (typeof child === 'string') continue;
      switch (child.name) {
        case 't':
          if (showing())
            add(
              child.children
                .filter((c) => typeof c === 'string')
                .join('')
                .replace(/\u00a0/g, ' '),
            );
          break;
        case 'tab':
        case 'cr':
        case 'ptab':
          if (showing()) add(' ');
          break;
        case 'br':
          if (child.attrs['type'] === 'page' || child.attrs['type'] === 'column') {
            ctx.report.add('page-break', ctx.place());
          } else if (showing()) {
            add(' ');
          }
          break;
        case 'noBreakHyphen':
          if (showing()) add('-');
          break;
        case 'sym':
          ctx.report.add('symbol', ctx.place());
          break;
        case 'fldChar':
          flush();
          readFieldChar(child, ctx);
          break;
        case 'instrText': {
          const field = ctx.fields[ctx.fields.length - 1];
          if (field?.showing === false) field.instruction += plainInstruction(child);
          break;
        }
        case 'footnoteReference':
        case 'endnoteReference':
          if (showing()) {
            flush();
            const footnote = child.name === 'footnoteReference';
            sink.inlines.push(
              noteText(
                footnote ? ctx.footnotes : ctx.endnotes,
                child,
                footnote ? 'Footnote' : 'Endnote',
                ctx,
              ),
            );
          }
          break;
        case 'commentReference':
          ctx.report.add('comment', ctx.place());
          break;
        case 'drawing':
        case 'pict':
        case 'object':
          if (showing()) readEmbedded(child, ctx, sink);
          break;
        case 'AlternateContent': {
          const choice = childOf(child, 'Choice');
          if (choice !== undefined) visit(choice.children);
          break;
        }
        default:
          break;
      }
    }
  };
  visit(run.children);
  flush();
  if (state.emitted && direct) ctx.report.add('direct-formatting', ctx.place());
}

/** The deepest heading level of a `TOC \o "1-3"` field, or undefined when it names none. */
function tocDepth(instruction: string): number | undefined {
  const match = /\\o\s+"\s*\d+\s*-\s*(\d+)\s*"/i.exec(instruction);
  return match?.[1] === undefined
    ? undefined
    : Math.min(MAX_TOC_DEPTH, Math.max(1, Number(match[1])));
}

const plainInstruction = (element: XmlElement): string =>
  element.children.filter((child) => typeof child === 'string').join('');

function readFieldChar(element: XmlElement, ctx: ImportContext): void {
  const type = element.attrs['fldCharType'];
  if (type === 'begin') {
    ctx.fields.push({ instruction: '', showing: false, link: undefined, toc: false });
  } else if (type === 'separate') {
    const field = ctx.fields[ctx.fields.length - 1];
    if (field !== undefined) {
      const inside = ctx.tocOpen();
      field.showing = true;
      if (!inside && /^\s*TOC\b/i.test(field.instruction)) {
        field.toc = true;
        ctx.pendingToc = { depth: tocDepth(field.instruction) };
      } else if (!inside) {
        field.link = fieldLink(field.instruction, ctx);
      }
    }
  } else if (type === 'end') {
    ctx.fields.pop();
  }
}

/** Containers that only group runs, and are read through. */
const TRANSPARENT = new Set(['smartTag', 'customXml', 'dir', 'bdo', 'sdtContent']);

function walk(
  container: XmlElement,
  link: string | undefined,
  ctx: ImportContext,
  sink: Sink,
): void {
  for (const node of elementsOf(container)) {
    switch (node.name) {
      case 'r':
        readRun(node, link, ctx, sink);
        break;
      case 'hyperlink':
        // The entries of a table of contents link to headings, and are dropped with it.
        walk(node, (ctx.tocOpen() ? undefined : hyperlinkOf(node, ctx)) ?? link, ctx, sink);
        break;
      case 'fldSimple': {
        const instruction = node.attrs['instr'] ?? '';
        if (ctx.tocOpen()) break;
        if (/^\s*TOC\b/i.test(instruction)) ctx.pendingToc = { depth: tocDepth(instruction) };
        else walk(node, fieldLink(instruction, ctx) ?? link, ctx, sink);
        break;
      }
      case 'ins':
      case 'moveTo':
        ctx.report.add('tracked-changes');
        walk(node, link, ctx, sink);
        break;
      case 'del':
      case 'moveFrom':
        ctx.report.add('tracked-changes');
        break;
      case 'sdt': {
        const inner = childOf(node, 'sdtContent');
        if (inner !== undefined) walk(inner, link, ctx, sink);
        break;
      }
      case 'oMath':
      case 'oMathPara':
        sink.extras.push(placeholder('Equation', plainText(node)));
        ctx.report.add('placeholder-equation', ctx.place());
        break;
      case 'bookmarkStart':
        ctx.report.add('bookmark');
        break;
      default:
        if (TRANSPARENT.has(node.name)) walk(node, link, ctx, sink);
    }
  }
}

/** The text of a paragraph as runs with marks, with what it holds that is not text kept apart. */
export function readParagraph(paragraph: XmlElement, ctx: ImportContext): ParagraphContent {
  ctx.paragraphNumber += 1;
  const sink: Sink = { inlines: [], extras: [] };
  walk(paragraph, undefined, ctx, sink);
  const markDeleted = childOf(childOf(childOf(paragraph, 'pPr'), 'rPr'), 'del') !== undefined;
  if (markDeleted) ctx.report.add('tracked-changes');
  return { ...sink, markDeleted };
}
