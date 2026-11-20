import {
  CODE_STYLE,
  plainCell,
  type Block,
  type Document,
  type Inline,
  type ListItemBlock,
  type Mark,
  type StyleName,
  type Stylesheet,
} from '@stanza/core';
import { characterClass, listItemClass, paragraphClass, tableClass } from '@stanza/css';
import type { Entry } from './styles-families.js';

/**
 * The sample document of the style editor (ADR 0036): one of everything the stylesheet declares,
 * so that a style can be seen as it will look. It is made from the stylesheet and kept nowhere.
 */

const text = (value: string, marks: readonly Mark[] = []): Inline => ({
  type: 'text',
  text: value,
  marks,
});

const paragraph = (content: readonly Inline[], style?: StyleName): Block => ({
  type: 'paragraph',
  ...(style !== undefined ? { style } : {}),
  content,
});

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, value: string): Block => ({
  type: 'heading',
  level,
  content: [text(value)],
});

const cell = (value: string) => plainCell([text(value)]);

/** Paragraph styles that the sample shows through its headings, lists and code block. */
const SHOWN_BY_KIND = /^(heading-[1-6]|list-(bulleted|numbered)|code|body)$/;

const label = (name: string, declared: string | undefined): string => declared ?? name;

export function sampleDocument(stylesheet: Stylesheet): Document {
  const blocks: Block[] = [heading(1, 'Sample document')];

  blocks.push(
    paragraph([
      text('Body text with '),
      text('strong', [{ type: 'strong' }]),
      text(', '),
      text('emphasized', [{ type: 'emphasis' }]),
      text(' and '),
      text('code', [{ type: 'code' }]),
      text(' words, and a '),
      text('link', [{ type: 'link', href: '#' }]),
      text('.'),
    ]),
  );

  if (stylesheet.characterStyles.size > 0) {
    const inlines: Inline[] = [text('Character styles: ')];
    for (const [name, style] of stylesheet.characterStyles) {
      inlines.push(text(label(name, style.label), [{ type: 'style', name }]), text(' '));
    }
    blocks.push(paragraph(inlines));
  }

  blocks.push({ type: 'stanza', kind: 'toc', text: 'depth: 3' });

  blocks.push(heading(2, 'Lists'));
  const item = (value: string, ...more: ListItemBlock[]) => ({
    blocks: [paragraph([text(value)]) as ListItemBlock, ...more],
  });
  blocks.push({
    type: 'list',
    kind: 'bulleted',
    items: [
      item('A bulleted item'),
      item('A bulleted item with a numbered list', {
        type: 'list',
        kind: 'numbered',
        items: [item('A numbered item'), item('Another numbered item')],
      }),
    ],
  });

  blocks.push(heading(3, 'Code and tables'));
  blocks.push({ type: 'code', text: 'let sample = "code";', style: CODE_STYLE });
  for (const [name, style] of stylesheet.tableStyles) {
    blocks.push(paragraph([text(`Table style: ${label(name, style.label)}`)]), {
      type: 'table',
      style: name,
      header: [cell('Header'), cell('Header')],
      rows: [[cell('Cell'), cell('Cell')]],
    });
  }

  blocks.push(
    heading(4, 'Heading level 4'),
    heading(5, 'Heading level 5'),
    heading(6, 'Heading level 6'),
  );

  for (const [name, style] of stylesheet.paragraphStyles) {
    if (SHOWN_BY_KIND.test(name)) continue;
    blocks.push(paragraph([text(`${label(name, style.label)}: a paragraph of this style.`)], name));
  }

  return { meta: { fields: {} }, blocks };
}

/** The selector of what an entry looks like in the sample, or undefined for what is not in it. */
export function sampleSelector(entry: Entry): string | undefined {
  switch (entry.kind) {
    case 'paragraph-style':
      return entry.family === 'lists'
        ? `.${listItemClass(entry.name as StyleName)}`
        : `.${paragraphClass(entry.name as StyleName)}`;
    case 'character-style':
      return `.${characterClass(entry.name as StyleName)}`;
    case 'table-style':
      return `.${tableClass(entry.name as StyleName)}`;
    default:
      return undefined;
  }
}

/** The class of the elements of the sample that the selected entry is drawn by. */
export const FOCUS_CLASS = 'sample-focus';

/** Marks what an entry looks like in the sample, and brings the first of it into view. */
export function focusSample(sample: HTMLElement, entry: Entry | undefined): void {
  for (const marked of sample.querySelectorAll(`.${FOCUS_CLASS}`)) {
    marked.classList.remove(FOCUS_CLASS);
  }
  const selector = entry === undefined ? undefined : sampleSelector(entry);
  if (selector === undefined) return;
  const found = [...sample.querySelectorAll(selector)];
  for (const element of found) element.classList.add(FOCUS_CLASS);
  found[0]?.scrollIntoView({ block: 'center' });
}
