import { SaxesParser } from 'saxes';

/** A parsed XML element. Names are local names, without the namespace prefix. */
export interface XmlElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export type XmlNode = XmlElement | string;

interface MutableElement {
  readonly name: string;
  readonly attrs: Record<string, string>;
  readonly children: XmlNode[];
}

/** Elements whose text is content. Whitespace between other elements is not. */
const TEXT_ELEMENTS = new Set(['t', 'instrText', 'delText']);

/** Parses XML text. Throws an `Error` with the reason when it is not well-formed. */
export function parseXml(text: string): XmlElement {
  const parser = new SaxesParser({ xmlns: true });
  const stack: MutableElement[] = [];
  let root: MutableElement | undefined;
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    const attrs: Record<string, string> = {};
    for (const attribute of Object.values(tag.attributes)) attrs[attribute.local] = attribute.value;
    const element: MutableElement = { name: tag.local, attrs, children: [] };
    const parent = stack[stack.length - 1];
    if (parent === undefined) root = element;
    else parent.children.push(element);
    stack.push(element);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('text', (content) => {
    const parent = stack[stack.length - 1];
    if (parent === undefined) return;
    if (TEXT_ELEMENTS.has(parent.name) || content.trim() !== '') parent.children.push(content);
  });
  parser.write(text).close();
  if (root === undefined) throw new Error('The XML has no root element.');
  return root;
}

/** The child elements, optionally only those with a name. */
export function elementsOf(element: XmlElement | undefined, name?: string): XmlElement[] {
  if (element === undefined) return [];
  const found: XmlElement[] = [];
  for (const child of element.children) {
    if (typeof child !== 'string' && (name === undefined || child.name === name)) found.push(child);
  }
  return found;
}

export function childOf(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return elementsOf(element, name)[0];
}

/**
 * All descendant elements with a name, in document order. It does not look inside elements named
 * `skip`, which are themselves found when they have the name.
 */
export function descendantsOf(
  element: XmlElement | undefined,
  name: string,
  skip?: string,
): XmlElement[] {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement): void => {
    for (const child of node.children) {
      if (typeof child === 'string') continue;
      if (child.name === name) found.push(child);
      if (child.name !== skip) visit(child);
    }
  };
  if (element !== undefined) visit(element);
  return found;
}

/** The text of all `t` elements below an element, as the text of the words it holds. */
export function plainText(element: XmlElement): string {
  const parts: string[] = [];
  const visit = (node: XmlElement): void => {
    for (const child of node.children) {
      if (typeof child === 'string') {
        if (node.name === 't') parts.push(child);
      } else {
        visit(child);
        if (child.name === 'p') parts.push(' ');
      }
    }
  };
  visit(element);
  return parts
    .join('')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}
