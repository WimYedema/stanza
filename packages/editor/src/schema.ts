import { Mark, Node, type Attributes, type Extensions } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { LIST_CLASS, characterClass, markClass } from '@phrase/css';
import { isStyleName } from '@phrase/core';

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

/** The name of a style. It is not the HTML `style` attribute, which is never read or written. */
const style: Attributes[string] = { default: null, rendered: false, parseHTML: () => null };

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
  group: 'block listItemBlock',
  content: 'inline*',
  addAttributes: () => ({ id, style }),
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: () => ['p', 0],
});

const Heading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({ id, style, level: plain(1) }),
  parseHTML: () =>
    [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${String(level)}`, attrs: { level } })),
  renderHTML: ({ node }) => [`h${String(node.attrs['level'])}`, 0],
});

const BulletList = Node.create({
  name: 'bulletList',
  group: 'block listItemBlock',
  content: 'listItem+',
  addAttributes: () => ({ id, style }),
  parseHTML: () => [{ tag: 'ul' }],
  renderHTML: () => ['ul', { class: LIST_CLASS }, 0],
});

const OrderedList = Node.create({
  name: 'orderedList',
  group: 'block listItemBlock',
  content: 'listItem+',
  addAttributes: () => ({ id, style }),
  parseHTML: () => [{ tag: 'ol' }],
  renderHTML: () => ['ol', { class: LIST_CLASS }, 0],
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
  renderHTML: () => ['pre', 0],
});

/** A `phrase-<kind>` block, kept as it is and shown as a labelled box. */
export const PHRASE_BLOCK_CLASS = 'phrase-block';

const PhraseBlock = Node.create({
  name: 'phraseBlock',
  group: 'block listItemBlock',
  atom: true,
  addAttributes: () => ({ id, style, kind: plain(''), text: plain('') }),
  parseHTML: () => [{ tag: 'div[data-phrase-kind]' }],
  renderHTML: ({ node }) => [
    'div',
    { class: PHRASE_BLOCK_CLASS, 'data-phrase-kind': String(node.attrs['kind']) },
    `phrase-${String(node.attrs['kind'])}`,
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
  renderHTML: () => ['table', ['tbody', 0]],
});

const Cell = TableCell.extend({
  content: 'inline*',
  addAttributes: cellAttributes,
  renderHTML: () => ['td', 0],
});

const HeaderCell = TableHeader.extend({
  content: 'inline*',
  addAttributes: cellAttributes,
  renderHTML: () => ['th', 0],
});

// The marks are declared in canonical order (ADR 0005), which is also their order in a run.
const Link = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes: () => ({ href: plain('') }),
  parseHTML: () => [
    { tag: 'a[href]', getAttrs: (element) => ({ href: element.getAttribute('href') }) },
  ],
  renderHTML: ({ mark }) => [
    'a',
    { href: String(mark.attrs['href']), class: markClass('link') },
    0,
  ],
});

const CharacterStyle = Mark.create({
  name: 'style',
  excludes: '',
  addAttributes: () => ({ name: plain('') }),
  parseHTML: () => [],
  renderHTML: ({ mark }) => {
    const name = String(mark.attrs['name']);
    return isStyleName(name) ? ['span', { class: characterClass(name) }, 0] : ['span', 0];
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

/** The nodes and marks of the document, without behaviour such as commands and plugins. */
export function schemaExtensions(): Extensions {
  return [
    Doc,
    Text,
    Paragraph,
    Heading,
    BulletList,
    OrderedList,
    ListItem,
    CodeBlock,
    PhraseBlock,
    TableNode,
    TableRow,
    Cell,
    HeaderCell,
    Link,
    CharacterStyle,
    Strong,
    Emphasis,
    Code,
  ];
}
