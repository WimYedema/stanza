import {
  BODY_STYLE,
  defaultHeadingStyle,
  type DocumentMeta,
  type HeaderFooter,
  type SlotPart,
} from '@phrase/core';
import {
  Footer,
  Header,
  Paragraph,
  SimpleField,
  Tab,
  TabStopType,
  TextRun,
  type ParagraphChild,
} from 'docx';
import type { PageGeometry } from './page.js';
import { slotValue } from './slot-values.js';
import { wordStyleId, wordStyleName } from './style-ids.js';

/** A run, or nothing for empty text, which would leave an empty run in the file. */
const textRun = (text: string): ParagraphChild | undefined =>
  text === '' ? undefined : new TextRun(text);

/** With a cover, the body is its own section and its pages are counted without the cover. */
interface Counting {
  readonly hasCover: boolean;
}

const slotChildren = (
  parts: readonly SlotPart[],
  meta: DocumentMeta,
  counting: Counting,
): ParagraphChild[] => parts.flatMap((part) => partChild(part, meta, counting) ?? []);

/** The text of a token: its value, or its label while it has no value. Fields get the label as their cached result. */
function partChild(
  part: SlotPart,
  meta: DocumentMeta,
  counting: Counting,
): ParagraphChild | undefined {
  if (part.kind === 'text') return textRun(part.text);
  if (part.kind === 'field') return textRun(slotValue(part, meta) ?? part.label);
  switch (part.token) {
    case 'page':
      return new SimpleField('PAGE', part.label);
    case 'pages':
      return new SimpleField(counting.hasCover ? 'SECTIONPAGES' : 'NUMPAGES', part.label);
    case 'section':
      return new SimpleField(`STYLEREF "${wordStyleName(defaultHeadingStyle(1))}"`, part.label);
    default:
      return textRun(slotValue(part, meta) ?? part.label);
  }
}

const isEmpty = (parts: readonly SlotPart[]): boolean =>
  parts.every((part) => part.kind === 'text' && part.text === '');

/**
 * The line of a header or footer, or undefined when all three slots are empty. The slots are
 * separated by tabs, with a centre tab at the middle of the text and a right tab at its edge.
 */
function line(
  spec: HeaderFooter,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
): Paragraph | undefined {
  const { left, center, right } = spec;
  if (isEmpty(left) && isEmpty(center) && isEmpty(right)) return undefined;
  const tab = (): ParagraphChild => new TextRun({ children: [new Tab()] });
  const children: ParagraphChild[] = slotChildren(left, meta, counting);
  const needsTabs = !isEmpty(center) || !isEmpty(right);
  if (needsTabs) children.push(tab(), ...slotChildren(center, meta, counting));
  if (!isEmpty(right)) children.push(tab(), ...slotChildren(right, meta, counting));
  return new Paragraph({
    style: wordStyleId(spec.style ?? BODY_STYLE),
    children,
    ...(needsTabs
      ? {
          tabStops: [
            { type: TabStopType.CENTER, position: Math.round(page.textWidthTwips / 2) },
            { type: TabStopType.RIGHT, position: page.textWidthTwips },
          ],
        }
      : {}),
  });
}

export function headerOf(
  spec: HeaderFooter | undefined,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
): Header | undefined {
  const paragraph = spec === undefined ? undefined : line(spec, meta, page, counting);
  return paragraph === undefined ? undefined : new Header({ children: [paragraph] });
}

export function footerOf(
  spec: HeaderFooter | undefined,
  meta: DocumentMeta,
  page: PageGeometry,
  counting: Counting,
): Footer | undefined {
  const paragraph = spec === undefined ? undefined : line(spec, meta, page, counting);
  return paragraph === undefined ? undefined : new Footer({ children: [paragraph] });
}
