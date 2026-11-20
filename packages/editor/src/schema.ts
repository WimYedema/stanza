import { Mark, Node, mergeAttributes, type Attributes, type Extensions } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { LIST_CLASS, characterClass, markClass } from '@stanza/css';
import { isStyleName, resolveLink, type LinkSchemes } from '@stanza/core';
import { Plugin } from '@tiptap/pm/state';

/**
 * The schema of the editor (ADR 0022). Nodes and marks carry style names and structure, and no
 * visual property. Anything a library adds for appearance, such as inline styles, column widths
 * or cell alignment, is switched off here. The classes of blocks come from `ContextClasses`.
 */

/** The ID of a block. It does not survive a split, so splitting never duplicates an ID. */
const id: Attributes[string] = {
  default: null,
  rendered: false,
  keepOnSplit: false,
  parseHTML: () => null,
};

/**
 * The name of a style. It travels in the HTML of the clipboard as `data-stanza-style`, never as the
 * HTML `style` attribute. A pasted name is only kept if the stylesheet declares it (ADR 0023).
 */
export const STYLE_ATTRIBUTE = 'data-stanza-style';

const style: Attributes[string] = {
  default: null,
  rendered: true,
  parseHTML: (element) => element.getAttribute(STYLE_ATTRIBUTE),
  renderHTML: (attributes) => {
    const name: unknown = attributes['style'];
    return typeof name === 'string' ? { [STYLE_ATTRIBUTE]: name } : {};
  },
};

/** An attribute that is only data: it is never read from or written to HTML. */
const plain = (defaultValue: unknown = null): Attributes[string] => ({
  default: defaultValue,
  rendered: false,
  parseHTML: () => defaultValue,
});

const Doc = Node.create({ name: 'doc', topNode: true, content: 'block*' });

const Text = Node.create({ name: 'text', group: 'inline' });

const Paragraph = Node.create({
  name: 'paragraph',
  group: 'block listItemBlock cellBlock',
  content: 'inline*',
  addAttributes: () => ({ id, style }),
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: ({ HTMLAttributes }) => ['p', HTMLAttributes, 0],
});

const Heading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({
    id,
    style,
    level: {
      default: 1,
      rendered: false,
      // The level is in the name of the element, `h1` to `h6`.
      parseHTML: (element) => Number(element.tagName.slice(1)),
    },
  }),
  parseHTML: () =>
    [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${String(level)}`, attrs: { level } })),
  renderHTML: ({ node, HTMLAttributes }) => [`h${String(node.attrs['level'])}`, HTMLAttributes, 0],
});

const BulletList = Node.create({
  name: 'bulletList',
  group: 'block listItemBlock cellBlock',
  content: 'listItem+',
  addAttributes: () => ({ id, style }),
  parseHTML: () => [{ tag: 'ul' }],
  renderHTML: ({ HTMLAttributes }) => [
    'ul',
    mergeAttributes({ class: LIST_CLASS }, HTMLAttributes),
    0,
  ],
});

const OrderedList = Node.create({
  name: 'orderedList',
  group: 'block listItemBlock cellBlock',
  content: 'listItem+',
  addAttributes: () => ({ id, style }),
  parseHTML: () => [{ tag: 'ol' }],
  renderHTML: ({ HTMLAttributes }) => [
    'ol',
    mergeAttributes({ class: LIST_CLASS }, HTMLAttributes),
    0,
  ],
});

const ListItem = Node.create({
  name: 'listItem',
  content: 'listItemBlock*',
  defining: true,
  parseHTML: () => [{ tag: 'li' }],
  renderHTML: () => ['li', 0],
});

const CodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block listItemBlock',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes: () => ({ id, style, language: plain() }),
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML: ({ HTMLAttributes }) => ['pre', HTMLAttributes, 0],
});

/** A `stanza-<kind>` block, kept as it is and shown as a labelled box. */
export const STANZA_BLOCK_CLASS = 'stanza-block';

/** The kind and the body of a stanza block, as they travel in the clipboard HTML. */
export const KIND_ATTRIBUTE = 'data-stanza-kind';
export const TEXT_ATTRIBUTE = 'data-stanza-text';

const fromHtml = (attribute: string): Attributes[string] => ({
  default: '',
  rendered: false,
  parseHTML: (element) => element.getAttribute(attribute) ?? '',
});

const StanzaBlock = Node.create({
  name: 'stanzaBlock',
  group: 'block listItemBlock',
  atom: true,
  addAttributes: () => ({
    id,
    style,
    kind: fromHtml(KIND_ATTRIBUTE),
    text: fromHtml(TEXT_ATTRIBUTE),
  }),
  parseHTML: () => [{ tag: `div[${KIND_ATTRIBUTE}]` }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(
      {
        class: STANZA_BLOCK_CLASS,
        [KIND_ATTRIBUTE]: String(node.attrs['kind']),
        [TEXT_ATTRIBUTE]: String(node.attrs['text']),
      },
      HTMLAttributes,
    ),
    `stanza-${String(node.attrs['kind'])}`,
  ],
});

// Merged cells and resizable columns are not part of the document, so these attributes only
// exist because the table commands of the library read them.
const cellAttributes = (): Attributes => ({
  colspan: plain(1),
  rowspan: plain(1),
  colwidth: plain(),
});

const TableNode = Table.configure({ resizable: false }).extend({
  group: 'block listItemBlock',
  content: 'tableRow*',
  addAttributes: () => ({ id, style, widths: plain() }),
  // The library's own view writes a wrapper, column groups and inline widths.
  addNodeView: () => null,
  renderHTML: ({ HTMLAttributes }) => ['table', HTMLAttributes, ['tbody', 0]],
});

// A cell holds paragraphs and lists (ADR 0048). The paragraphs take the cell style of the table.
const Cell = TableCell.extend({
  content: 'cellBlock+',
  addAttributes: cellAttributes,
  renderHTML: () => ['td', 0],
});

const HeaderCell = TableHeader.extend({
  content: 'cellBlock+',
  addAttributes: cellAttributes,
  renderHTML: () => ['th', 0],
});

// The marks are declared in canonical order (ADR 0005), which is also their order in a run.
export const LINK_SOURCE_ATTRIBUTE = 'data-stanza-href';

const linkAttributes = (href: string, schemes: LinkSchemes): Record<string, string> => {
  const target = resolveLink(href, schemes);
  return {
    ...(!target.ok || target.href !== href ? { [LINK_SOURCE_ATTRIBUTE]: href } : {}),
    class: markClass('link'),
    ...(target.ok ? { href: target.href } : { title: target.message }),
  };
};

const Link = Mark.create<{ schemes: () => LinkSchemes }, { views: Set<() => void> }>({
  name: 'link',
  inclusive: false,
  addOptions: () => ({ schemes: () => ({}) }),
  addStorage: () => ({ views: new Set() }),
  addAttributes: () => ({ href: plain('') }),
  parseHTML: () => [
    {
      tag: 'a[href]',
      getAttrs: (element) => ({
        href: element.getAttribute(LINK_SOURCE_ATTRIBUTE) ?? element.getAttribute('href'),
      }),
    },
  ],
  renderHTML({ mark }) {
    return ['a', linkAttributes(String(mark.attrs['href']), this.options.schemes()), 0];
  },
  addMarkView() {
    return ({ mark }) => {
      const dom = document.createElement('a');
      const refresh = (): void => {
        dom.removeAttribute('href');
        dom.removeAttribute('title');
        for (const [name, value] of Object.entries(
          linkAttributes(String(mark.attrs['href']), this.options.schemes()),
        )) {
          dom.setAttribute(name, value);
        }
      };
      refresh();
      this.storage.views.add(refresh);
      return {
        dom,
        contentDOM: dom,
        destroy: () => {
          this.storage.views.delete(refresh);
        },
      };
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: () => {
          let previous = this.options.schemes();
          return {
            update: () => {
              const next = this.options.schemes();
              if (next === previous) return;
              previous = next;
              for (const refresh of this.storage.views) refresh();
            },
          };
        },
      }),
    ];
  },
});

const CharacterStyle = Mark.create({
  name: 'style',
  excludes: '',
  addAttributes: () => ({
    name: {
      default: '',
      rendered: false,
      parseHTML: (element) => element.getAttribute(STYLE_ATTRIBUTE) ?? '',
    },
  }),
  parseHTML: () => [{ tag: `span[${STYLE_ATTRIBUTE}]` }],
  renderHTML: ({ mark }) => {
    const name = String(mark.attrs['name']);
    return isStyleName(name)
      ? ['span', { class: characterClass(name), [STYLE_ATTRIBUTE]: name }, 0]
      : ['span', 0];
  },
});

const Strong = Mark.create({
  name: 'strong',
  parseHTML: () => [{ tag: 'strong' }, { tag: 'b' }],
  renderHTML: () => ['strong', { class: markClass('strong') }, 0],
});

const Emphasis = Mark.create({
  name: 'emphasis',
  parseHTML: () => [{ tag: 'em' }, { tag: 'i' }],
  renderHTML: () => ['em', { class: markClass('emphasis') }, 0],
});

const Code = Mark.create({
  name: 'code',
  parseHTML: () => [{ tag: 'code' }],
  renderHTML: () => ['code', { class: markClass('code') }, 0],
});

/** The document schema, with live destinations for project links but no editing commands. */
export function schemaExtensions(schemes: () => LinkSchemes = () => ({})): Extensions {
  return [
    Doc,
    Text,
    Paragraph,
    Heading,
    BulletList,
    OrderedList,
    ListItem,
    CodeBlock,
    StanzaBlock,
    TableNode,
    TableRow,
    Cell,
    HeaderCell,
    Link.configure({ schemes }),
    CharacterStyle,
    Strong,
    Emphasis,
    Code,
  ];
}
