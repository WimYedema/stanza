import { type Alignment, type SlotPart } from '@stanza/core';
import { childOf, elementsOf, type XmlElement } from '../xml.js';
import {
  type Border,
  type Frame,
  type Look,
  type Part,
  descendants,
  kebab,
  round,
  runsOf,
  textOfRun,
  twipsToPt,
} from './shared.js';
import { Looks } from './looks.js';
import { shapesOf, type PageBox, type Shape } from './shapes.js';

/**
 * Paragraphs and tables as blocks: their text with placeholders, content controls and fields as
 * tokens, their pictures, and their estimated heights.
 */

/** The names of placeholders that become the built-in tokens, in lower case without spaces. */
export const TOKEN_PLACEHOLDERS: Readonly<
  Record<string, 'title' | 'authors' | 'classification' | 'version'>
> = {
  title: 'title',
  documenttitle: 'title',
  author: 'authors',
  authors: 'authors',
  'author(s)': 'authors',
  authorname: 'authors',
  authornames: 'authors',
  'authorname(s)': 'authors',
  classification: 'classification',
  version: 'version',
};

/** The document properties that content controls bind to, and their tokens or fields. */
export const BOUND_PROPERTIES: Readonly<Record<string, string>> = {
  title: 'title',
  creator: 'authors',
  subject: 'field:subtitle',
  PublishDate: 'field:date',
};

/** The tokens that are Word fields, whose label is the number Word shows until it updates them. */
export const PAGE_TOKENS = new Set(['page', 'pages']);

/** A label for a value: its name in words, such as `Document number`; none for the version. */
export function readable(name: string): string {
  if (name === 'version' || name === 'section') return '';
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Markers in the text of a paragraph while it is read; private-use characters, never in text. */
export const FIELD = '\uE001';
export const LABEL = '\uE002';
export const CLOSE = '\uE003';
export const TOKEN = '\uE004';
/** A tab, followed by `L`, `C` or `R` for a positional tab, or by `T` for a tab to a tab stop. */
export const SEGMENT = '\uE005';

/**
 * The token or field of a `[Placeholder]`. Its label is the text inside the brackets, shown while
 * the value is missing; a label cannot hold the brackets of the link it is written in.
 */
export function placeholderPart(placeholder: string, fields: Set<string>): SlotPart {
  const label = placeholder.slice(1, -1).trim();
  const token = TOKEN_PLACEHOLDERS[label.toLowerCase().replace(/\s+/g, '')];
  if (token !== undefined) return { kind: 'token', token, label };
  let name = kebab(label);
  if (name === '' || !/^[a-z]/.test(name)) name = `field-${name}`.replace(/-+$/, '');
  fields.add(name);
  return { kind: 'field', name, label };
}

/** Text with `[Placeholders]` turned into tokens and fields (ADR 0094). */
export function slotParts(text: string, fields: Set<string>): SlotPart[] {
  const parts: SlotPart[] = [];
  let from = 0;
  for (const match of text.matchAll(/\[[^\][\n]+\]/g)) {
    if (match.index > from) parts.push({ kind: 'text', text: text.slice(from, match.index) });
    parts.push(placeholderPart(match[0], fields));
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ kind: 'text', text: text.slice(from) });
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Blocks of the first page

export interface PictureRef {
  readonly id: string;
  readonly widthPt: number;
  readonly heightPt: number;
}

export type Block =
  | {
      readonly kind: 'paragraph';
      readonly look: Look;
      readonly style: string | undefined;
      readonly lines: readonly SlotPart[][];
      readonly pictures: readonly PictureRef[];
      readonly borders: readonly Border[];
      readonly heightPt: number;
      readonly pageBreak: boolean;
      readonly sectionBreak: boolean;
      readonly frame?: Frame;
      /** In a header or footer: the parts of a line that tabs put left, centre and right. */
      readonly segments?: readonly Segment[];
    }
  | {
      readonly kind: 'table';
      readonly table: XmlElement;
      readonly heightPt: number;
      /** The part that holds the table, for the pictures in its cells. */
      readonly part: Part;
    };

/** A part of a line of a header or footer, between tabs (ADR 0095). */
export interface Segment {
  readonly alignment: Alignment;
  readonly lines: readonly SlotPart[][];
  readonly pictures: readonly PictureRef[];
}

/** What holds content of its own, outside the text of the paragraph it is anchored in. */
export const OWN_CONTENT = new Set([
  'pPr',
  'drawing',
  'pict',
  'AlternateContent',
  'txbxContent',
  'object',
]);

export function lineHeightPt(look: Look): number {
  const size = look.sizePt ?? 11;
  const spacing = look.lineSpacing;
  if (spacing?.rule === 'exactly') return spacing.pt;
  if (spacing?.rule === 'at-least') return Math.max(spacing.pt, size * 1.2);
  return size * 1.2 * (spacing?.rule === 'multiple' ? spacing.factor : 1);
}

export class Reader {
  readonly fields = new Set<string>();
  readonly converted: string[] = [];
  readonly approximated: string[] = [];
  readonly leftOut: string[] = [];

  /** True while a header or a footer is read, where the page fields are tokens and tabs part a line. */
  band = false;

  /**
   * While the first page of a cover is read, the page it is on, and the shapes anchored to it that
   * were found (ADR 0098); they are placed on the page and not in the flow.
   */
  shapes: { readonly page: PageBox; readonly found: { shape: Shape; part: Part }[] } | undefined;

  constructor(readonly looks: Looks) {}

  /**
   * The marker of a Word field (ADR 0095): page fields are tokens in a header or footer, the
   * revision is the version, a date is the field `date`, and a document property is its token or a
   * field of its name. Any other field keeps its last result as text.
   */
  private fieldMarker(instruction: string, shown: string): string {
    const words = instruction.trim().split(/\s+/);
    const name = words[0]?.toUpperCase() ?? '';
    // The label is what shows while the value is missing: the name of the value, and for a page
    // field the number that Word shows until it updates the field. A template's own value, such as
    // its date, would show in documents that have none.
    const token = (value: string): string =>
      `${TOKEN}${value}${LABEL}${PAGE_TOKENS.has(value) ? shown || '1' : readable(value)}${CLOSE}`;
    const field = (value: string): string => {
      this.fields.add(value);
      return `${FIELD}${value}${LABEL}${readable(value)}${CLOSE}`;
    };
    const paged = (value: string): string => {
      if (this.band) return token(value);
      this.approximated.push(`The field ${name} on the cover keeps its last result as text.`);
      return shown;
    };
    switch (name) {
      case 'PAGE':
        return paged('page');
      case 'NUMPAGES':
      case 'SECTIONPAGES':
        return paged('pages');
      case 'STYLEREF':
        return paged('section');
      case 'REVNUM':
        this.approximated.push(
          'The REVNUM field, which counts the saves of a file, is the version token (ADR 0095).',
        );
        return token('version');
      case 'DATE':
      case 'CREATEDATE':
      case 'SAVEDATE':
      case 'PRINTDATE':
        return field('date');
      case 'TITLE':
        return token('title');
      case 'AUTHOR':
        return token('authors');
      case 'SUBJECT':
        return field('subtitle');
      case 'DOCPROPERTY': {
        const property = (words[1] ?? '').replace(/"/g, '');
        const known = BOUND_PROPERTIES[property.charAt(0).toLowerCase() + property.slice(1)];
        if (known === undefined) return field(kebab(property) || 'property');
        return known.startsWith('field:') ? field(known.slice('field:'.length)) : token(known);
      }
      default:
        this.leftOut.push(`The field ${name} is left out; its last result stays as text.`);
        return shown;
    }
  }

  paragraph(element: XmlElement, part: Part, alignment?: Alignment): Block[] {
    let look = this.looks.lookOf(element);
    // A paragraph that starts with a tab to a centre or right tab stop is aligned there.
    const content = (run: XmlElement): XmlElement[] =>
      elementsOf(run).filter((child) => ['t', 'tab', 'br', 'cr'].includes(child.name));
    const first = runsOf(element).find((run) => content(run).length > 0);
    if (first !== undefined && content(first)[0]?.name === 'tab') {
      const stop = this.looks.tabStopsOf(element)[0];
      if (stop === 'center') look = { ...look, alignment: 'center' };
      else if (stop === 'right' || stop === 'end') look = { ...look, alignment: 'right' };
    }
    if (alignment !== undefined) look = { ...look, alignment };
    const extra: Block[] = [];
    // A content control bound to a document property is that property.
    let text = '';
    // A complex field: its instruction, then its last result, which the marker replaces.
    let fieldPhase: 'none' | 'instruction' | 'result' = 'none';
    let instruction = '';
    let shownResult = '';
    // The part of the line each picture is in, in the order of the drawings.
    const drawingSegments: number[] = [];
    const segmentsSoFar = (): number => text.split(SEGMENT).length - 1;
    const readRun = (run: XmlElement): void => {
      for (const piece of elementsOf(run)) {
        if (piece.name === 'fldChar') {
          const type = piece.attrs['fldCharType'];
          if (type === 'begin') {
            fieldPhase = 'instruction';
            instruction = '';
            shownResult = '';
          } else if (type === 'separate') {
            fieldPhase = 'result';
          } else if (type === 'end') {
            text += this.fieldMarker(instruction, shownResult);
            fieldPhase = 'none';
          }
          continue;
        }
        if (piece.name === 'instrText') {
          instruction += piece.children.filter((node) => typeof node === 'string').join('');
          continue;
        }
        if (piece.name === 'drawing' || piece.name === 'AlternateContent') {
          if (
            descendants({ name: 'x', attrs: {}, children: [piece] }, 'drawing').length > 0 ||
            piece.name === 'drawing'
          ) {
            drawingSegments.push(segmentsSoFar());
          }
          continue;
        }
        const value =
          piece.name === 't'
            ? piece.children.filter((node) => typeof node === 'string').join('')
            : piece.name === 'tab'
              ? `${SEGMENT}T`
              : piece.name === 'ptab'
                ? `${SEGMENT}${(piece.attrs['alignment'] ?? 'left').charAt(0).toUpperCase()}`
                : piece.name === 'br' || piece.name === 'cr'
                  ? '\n'
                  : '';
        if (fieldPhase === 'result') shownResult += value;
        else if (fieldPhase === 'none') text += value;
      }
    };
    const visit = (node: XmlElement): void => {
      for (const child of elementsOf(node)) {
        if (child.name === 'sdt') {
          const binding = childOf(childOf(child, 'sdtPr'), 'dataBinding')?.attrs['xpath'];
          const property = binding === undefined ? undefined : /(\w+)\[1\]\s*$/.exec(binding)?.[1];
          if (property !== undefined) {
            // The label is the name of the property, not the value the template has.
            const token = BOUND_PROPERTIES[property];
            if (token === undefined || token.startsWith('field:')) {
              const field = token === undefined ? kebab(property) : token.slice('field:'.length);
              this.fields.add(field);
              text += `${FIELD}${field}${LABEL}${readable(field)}${CLOSE}`;
            } else {
              text += `${TOKEN}${token}${LABEL}${readable(token)}${CLOSE}`;
            }
            continue;
          }
          visit(childOf(child, 'sdtContent') ?? child);
          continue;
        }
        if (child.name === 'r') {
          readRun(child);
          continue;
        }
        if (child.name === 'fldSimple') {
          text += this.fieldMarker(
            child.attrs['instr'] ?? '',
            runsOf(child).map(textOfRun).join(''),
          );
          continue;
        }
        if (OWN_CONTENT.has(child.name)) continue;
        visit(child);
      }
    };
    visit(element);
    // An anchored drawing of a cover is a shape on the page, unless it is a sensitivity label.
    const asShapes = new Set<XmlElement>();
    if (this.shapes !== undefined) {
      for (const drawing of descendants(element, 'drawing')) {
        const anchor = childOf(drawing, 'anchor');
        if (anchor === undefined || descendants(drawing, 'classification').length > 0) continue;
        asShapes.add(drawing);
        for (const shape of shapesOf(anchor, this.shapes.page, this.looks.theme, this)) {
          this.shapes.found.push({ shape, part });
        }
      }
    }
    const pictures: (PictureRef & { segment: number })[] = [];
    for (const [index, drawing] of descendants(element, 'drawing').entries()) {
      if (asShapes.has(drawing)) continue;
      const holder = childOf(drawing, 'inline') ?? childOf(drawing, 'anchor');
      if (holder?.name === 'anchor')
        this.approximated.push('A picture anchored to the page is placed in the flow.');
      const blip = descendants(drawing, 'blip')[0];
      const extent = childOf(holder, 'extent');
      const id = blip?.attrs['embed'];
      if (id === undefined || extent === undefined) continue;
      const target = part.relationships.get(id);
      if (target === undefined) continue;
      pictures.push({
        id: target.path,
        widthPt: round(Number(extent.attrs['cx'] ?? '0') / 12700),
        heightPt: round(Number(extent.attrs['cy'] ?? '0') / 12700),
        segment: drawingSegments[index] ?? 0,
      });
    }
    for (const drawing of descendants(element, 'drawing')) {
      if (asShapes.has(drawing)) continue;
      // A text box at the right of the page, or in its centre, keeps that side.
      const anchor = childOf(drawing, 'anchor');
      const side =
        childOf(childOf(childOf(anchor, 'positionH'), 'align'), 'align') ??
        childOf(childOf(anchor, 'positionH'), 'align');
      const placed = side?.children
        .filter((node) => typeof node === 'string')
        .join('')
        .trim();
      const boxAlignment: Alignment | undefined =
        placed === 'right' || placed === 'outside'
          ? 'right'
          : placed === 'center'
            ? 'center'
            : undefined;
      // A text box that a sensitivity label put there holds the classification of the document.
      const labelled = descendants(drawing, 'classification').length > 0;
      for (const box of descendants(drawing, 'txbxContent')) {
        this.approximated.push('A text box is placed in the flow, where it is anchored.');
        for (const inner of elementsOf(box, 'p')) {
          for (const block of this.paragraph(inner, part, boxAlignment)) {
            if (!labelled || block.kind !== 'paragraph') {
              extra.push(block);
              continue;
            }
            const label = block.lines
              .flat()
              .map((part) => (part.kind === 'text' ? part.text : part.label))
              .join('')
              .trim();
            if (label === '') continue;
            extra.push({ ...block, lines: [[{ kind: 'token', token: 'classification', label }]] });
            this.converted.push(
              'The classification of a sensitivity label as the classification token.',
            );
          }
        }
      }
    }
    if (descendants(element, 'pict').length > 0 && pictures.length === 0) {
      this.leftOut.push('A VML picture or shape (w:pict) is left out.');
    }
    const parts = text.split(SEGMENT);
    const stops = this.looks.tabStopsOf(element);
    let stop = 0;
    const segments: Segment[] = parts.map((piece, index) => {
      if (index === 0) {
        return {
          alignment: look.alignment ?? 'left',
          lines: piece.split('\n').map((line) => this.lineParts(line)),
          pictures: pictures.filter((picture) => picture.segment === 0),
        };
      }
      const kind = piece.charAt(0);
      const tabKind = kind === 'T' ? stops[stop++] : undefined;
      const side: Alignment =
        kind === 'C' || tabKind === 'center'
          ? 'center'
          : kind === 'R' || tabKind === 'right' || tabKind === 'end'
            ? 'right'
            : 'left';
      return {
        alignment: side,
        lines: piece
          .slice(1)
          .split('\n')
          .map((line) => this.lineParts(line)),
        pictures: pictures.filter((picture) => picture.segment === index),
      };
    });
    const split = this.band && segments.length > 1;
    const lines = split
      ? []
      : text
          .replace(new RegExp(`${SEGMENT}[LCRT]`, 'g'), ' ')
          .split('\n')
          .map((line) => this.lineParts(line));
    const visibleLines = split
      ? Math.max(...segments.map((segment) => segment.lines.filter((l) => l.length > 0).length))
      : lines.filter((line) => line.length > 0).length;
    const textHeight = Math.max(visibleLines, 1) * lineHeightPt(look);
    const picturesHeight = pictures.reduce((sum, picture) => Math.max(sum, picture.heightPt), 0);
    const heightPt =
      (look.spaceBeforePt ?? 0) + Math.max(textHeight, picturesHeight) + (look.spaceAfterPt ?? 0);
    const pPr = childOf(element, 'pPr');
    const frame = this.looks.frameOf(element);
    const block: Block = {
      kind: 'paragraph',
      look,
      style: this.looks.styleOf(element),
      lines,
      pictures,
      borders: this.looks.bordersOf(element),
      heightPt,
      pageBreak:
        descendants(element, 'br').some((br) => br.attrs['type'] === 'page') ||
        childOf(pPr, 'pageBreakBefore') !== undefined,
      sectionBreak: childOf(pPr, 'sectPr') !== undefined,
      ...(frame !== undefined ? { frame } : {}),
      ...(split ? { segments } : {}),
    };
    return [block, ...extra];
  }

  /** A line of text with placeholders and bound properties as parts. */
  private lineParts(line: string): SlotPart[] {
    const parts: SlotPart[] = [];
    let rest = line;
    while (rest !== '') {
      const at = rest.search(new RegExp(`[${FIELD}${TOKEN}]`));
      const plain = at < 0 ? rest : rest.slice(0, at);
      parts.push(...slotParts(plain, this.fields));
      if (at < 0) break;
      const close = rest.indexOf(CLOSE, at);
      const [name = '', label = ''] = rest.slice(at + 1, close).split(LABEL);
      if (rest[at] === TOKEN) {
        parts.push({
          kind: 'token',
          token: name as 'title' | 'authors' | 'page' | 'pages' | 'section' | 'version',
          label,
        });
      } else {
        this.fields.add(name);
        parts.push({ kind: 'field', name, label });
      }
      rest = rest.slice(close + 1);
    }
    // Tabs and spaces at the ends of a line place it; the alignment of its style does that here.
    const first = parts[0];
    if (first?.kind === 'text') parts[0] = { kind: 'text', text: first.text.trimStart() };
    const last = parts.at(-1);
    if (last?.kind === 'text')
      parts[parts.length - 1] = { kind: 'text', text: last.text.trimEnd() };
    return parts.filter((part) => part.kind !== 'text' || part.text !== '');
  }

  table(element: XmlElement, part: Part): Block {
    let height = 0;
    for (const row of elementsOf(element, 'tr')) {
      const fixed = twipsToPt(childOf(childOf(row, 'trPr'), 'trHeight')?.attrs['val']);
      const cells = elementsOf(row, 'tc').map((cell) =>
        elementsOf(cell, 'p').reduce((sum, paragraph) => {
          const block = this.paragraph(paragraph, part)[0];
          return sum + (block?.heightPt ?? 0);
        }, 0),
      );
      height += Math.max(fixed ?? 0, ...cells, 0) + 2;
    }
    return { kind: 'table', table: element, heightPt: height, part };
  }

  /** The blocks of a body or a header or footer, up to the end of the first page of a body. */
  blocks(container: XmlElement, part: Part, firstPage: boolean): Block[] {
    const blocks: Block[] = [];
    for (const child of elementsOf(container)) {
      if (child.name === 'p') {
        const read = this.paragraph(child, part);
        blocks.push(...read);
        const first = read[0];
        if (firstPage && first?.kind === 'paragraph' && (first.pageBreak || first.sectionBreak))
          break;
      } else if (child.name === 'tbl') {
        blocks.push(this.table(child, part));
      } else if (child.name === 'sdt') {
        blocks.push(...this.blocks(childOf(child, 'sdtContent') ?? child, part, firstPage));
      }
    }
    return blocks;
  }
}

// ---------------------------------------------------------------------------------------------
// The import
