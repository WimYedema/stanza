import { isStyleName, resolveLink, type LinkSchemes, type Stylesheet } from '@phrase/core';
import { isAllowedHref } from './commands.js';
import type { Notice } from './notice.js';
import {
  KIND_ATTRIBUTE,
  LINK_SOURCE_ATTRIBUTE,
  STYLE_ATTRIBUTE,
  TEXT_ATTRIBUTE,
} from './schema.js';

/**
 * Cleans pasted HTML before the editor reads it (ADR 0023). Only structure that the document can
 * hold is kept, and no attribute: not `style`, `class` or `id`, and nothing of fonts, sizes or colors.
 * What the editor writes itself, the names of styles and the body of phrase blocks, travels in
 * data attributes and is kept when the stylesheet knows the name.
 */

/** Elements that are kept as they are, without attributes. */
const KEPT = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'pre',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'code',
]);

/** The parts of a table, which are unwrapped when the table is inside a cell. */
const NESTED_TABLE = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);

/** Elements whose names of paragraph styles are kept. */
const PARAGRAPH_STYLED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'ul', 'ol']);

/** Elements that are not content at all, with everything in them. */
const DROPPED = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'head',
  'title',
  'meta',
  'link',
  'noscript',
  'template',
  'svg',
  'math',
  'img',
  'video',
  'audio',
  'canvas',
  'form',
  'input',
  'select',
  'textarea',
  'button',
]);

const BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,pre';
const KIND = /^[a-z][a-z0-9-]*$/;

/** The value of one property of an inline `style` attribute, in lower case. */
function declared(element: Element, property: string): string | undefined {
  for (const part of (element.getAttribute('style') ?? '').split(';')) {
    const [name = '', ...value] = part.split(':');
    if (name.trim().toLowerCase() === property) return value.join(':').trim().toLowerCase();
  }
  return undefined;
}

const isBold = (weight: string): boolean =>
  weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;

const isItalic = (style: string): boolean => style === 'italic' || style === 'oblique';

/**
 * The HTML of a paste, reduced to the structure of the document. Where the paste lands in a table
 * cell (`intoCell`), it is reduced further to what a cell holds: paragraphs and lists (ADR 0048).
 */
export function normalizePastedHtml(
  html: string,
  stylesheet: Stylesheet,
  intoCell = false,
  schemes: LinkSchemes = {},
  notice: (notice: Notice) => void = () => undefined,
): string {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const out = source.implementation.createHTMLDocument('');

  const styleName = (element: Element, known: ReadonlyMap<unknown, unknown>): string | null => {
    const name = element.getAttribute(STYLE_ATTRIBUTE);
    return name !== null && isStyleName(name) && known.has(name) ? name : null;
  };

  const copy = (from: Node, into: Node): void => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === 3) {
        into.appendChild(out.createTextNode(child.textContent ?? ''));
      } else if (child.nodeType === 1) {
        element(child as Element, into);
      }
    }
  };

  /** Writes the children of `from` into a new element, or straight into `into` when it is null. */
  const wrap = (from: Element, into: Node, tag: string | null, attrs: object = {}): void => {
    if (tag === null) {
      copy(from, into);
      return;
    }
    const made = out.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) made.setAttribute(name, String(value));
    into.appendChild(made);
    copy(from, made);
  };

  const element = (from: Element, into: Node): void => {
    const tag = from.tagName.toLowerCase();
    if (DROPPED.has(tag)) return;
    if (tag === 'br') {
      into.appendChild(out.createTextNode(' '));
      return;
    }
    if (tag === 'a') {
      const href = from.getAttribute(LINK_SOURCE_ATTRIBUTE) ?? from.getAttribute('href') ?? '';
      if (isAllowedHref(href, schemes)) wrap(from, into, 'a', { href: href.trim() });
      else {
        if (href !== '') {
          const target = resolveLink(href, schemes);
          notice({
            code: 'paste-link-dropped',
            message: `The link "${href}" was removed from pasted text. ${target.ok ? 'This destination is not allowed.' : target.message}`,
          });
        }
        copy(from, into);
      }
      return;
    }
    if (tag === 'strong' || tag === 'b') {
      const weight = declared(from, 'font-weight');
      // Google Docs wraps a whole paste in a `b` that is not bold.
      if (weight !== undefined && !isBold(weight)) copy(from, into);
      else wrap(from, into, 'strong');
      return;
    }
    if (tag === 'em' || tag === 'i') {
      const style = declared(from, 'font-style');
      if (style !== undefined && !isItalic(style)) copy(from, into);
      else wrap(from, into, 'em');
      return;
    }
    if (tag === 'div' && from.hasAttribute(KIND_ATTRIBUTE)) {
      // A phrase block does not fit in a cell.
      if (intoCell || from.parentElement?.closest('td, th') != null) return;
      const kind = from.getAttribute(KIND_ATTRIBUTE) ?? '';
      if (!KIND.test(kind)) return;
      const made = out.createElement('div');
      made.setAttribute(KIND_ATTRIBUTE, kind);
      made.setAttribute(TEXT_ATTRIBUTE, from.getAttribute(TEXT_ATTRIBUTE) ?? '');
      const style = styleName(from, stylesheet.paragraphStyles);
      if (style !== null) made.setAttribute(STYLE_ATTRIBUTE, style);
      into.appendChild(made);
      return;
    }
    if (tag === 'div') {
      // A division of text is a paragraph, and a division of blocks is only a container.
      wrap(from, into, from.querySelector(BLOCKS) === null ? 'p' : null);
      return;
    }
    if (tag === 'span' && from.hasAttribute(STYLE_ATTRIBUTE)) {
      const style = styleName(from, stylesheet.characterStyles);
      wrap(
        from,
        into,
        style === null ? null : 'span',
        style === null ? {} : { [STYLE_ATTRIBUTE]: style },
      );
      return;
    }
    if (KEPT.has(tag)) {
      // A cell holds paragraphs and lists (ADR 0048): a table in a cell is flattened into the text
      // of its cells, a heading or code there is a paragraph, and the blocks of a cell take the
      // cell style, so they keep no style name.
      const inCell = intoCell || from.parentElement?.closest('td, th') != null;
      if (inCell && NESTED_TABLE.has(tag)) {
        copy(from, into);
        return;
      }
      if (inCell && (tag === 'td' || tag === 'th' || tag === 'pre' || /^h[1-6]$/.test(tag))) {
        wrap(from, into, 'p');
        return;
      }
      const known = tag === 'table' ? stylesheet.tableStyles : stylesheet.paragraphStyles;
      const styled = (tag === 'table' || PARAGRAPH_STYLED.has(tag)) && !inCell;
      const style = styled ? styleName(from, known) : null;
      wrap(from, into, tag, style === null ? {} : { [STYLE_ATTRIBUTE]: style });
      return;
    }
    // Anything else is only a wrapper. Bold and italic written as styles are marks.
    const weight = declared(from, 'font-weight');
    const italic = declared(from, 'font-style');
    const marks = [
      ...(weight !== undefined && isBold(weight) ? ['strong'] : []),
      ...(italic !== undefined && isItalic(italic) ? ['em'] : []),
    ];
    let target = into;
    for (const mark of marks) {
      const made = out.createElement(mark);
      target.appendChild(made);
      target = made;
    }
    copy(from, target);
  };

  copy(source.body, out.body);
  return out.body.innerHTML;
}
