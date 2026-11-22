import { isNodeId, type NodeId } from '@stanza/core';
import { readDocx, type ReadFailure } from './docx-package.js';
import type { XmlElement } from './xml.js';

/** A paragraph of the body, with the block of the Stanza bookmark it falls under. */
export interface DocxParagraph {
  /** The text as it was built: deleted text of a tracked change in, inserted text out. */
  readonly text: string;
  /** The block of the last Stanza bookmark that starts before the end of the paragraph. */
  readonly block?: NodeId;
}

/** A tracked change in the body (ADR 0084, "Changes to the text"). It is reported, never applied. */
export interface TrackedChange {
  readonly kind: 'insertion' | 'deletion';
  readonly text: string;
  /** The display name of the person; nothing else of the account is read. */
  readonly author: string;
  /** As Word wrote it, which is local time whatever its zone says. */
  readonly date?: string;
  readonly block?: NodeId;
}

export interface BodyText {
  readonly paragraphs: readonly DocxParagraph[];
  readonly trackedChanges: readonly TrackedChange[];
}

const BOOKMARK = /^(?:stanza|phrase)_(.+)$/;

const stringsOf = (element: XmlElement): string =>
  element.children.filter((child): child is string => typeof child === 'string').join('');

/**
 * The paragraphs of the body and its tracked changes, in document order. The text of fields is
 * left out where Word computes it (page numbers, the page numbers of a table of contents), since
 * Word may update it when the file is opened; the code of a field is never text.
 */
export function bodyText(document: XmlElement): BodyText {
  const paragraphs: DocxParagraph[] = [];
  const trackedChanges: TrackedChange[] = [];
  let last: NodeId | undefined;
  let text = '';
  /** Complex fields that are open, and whether each is past its `separate`, in its result. */
  const fields: boolean[] = [];
  let change:
    { kind: TrackedChange['kind']; author: string; date?: string; text: string } | undefined;
  const inResult = (): boolean => fields.some((separated) => separated);
  const add = (value: string, deleted: boolean): void => {
    if (inResult()) return;
    if (change !== undefined) change.text += value;
    // The text as built has what a deletion took out, and not what an insertion added.
    if (change?.kind !== 'insertion' || deleted) text += value;
  };
  const visit = (element: XmlElement): void => {
    for (const child of element.children) {
      if (typeof child === 'string') continue;
      switch (child.name) {
        case 'bookmarkStart': {
          const id = BOOKMARK.exec(child.attrs['name'] ?? '')?.[1];
          if (id !== undefined && isNodeId(id)) last = id;
          break;
        }
        case 'fldChar': {
          const type = child.attrs['fldCharType'];
          if (type === 'begin') fields.push(false);
          else if (type === 'separate' && fields.length > 0) fields[fields.length - 1] = true;
          else if (type === 'end') fields.pop();
          break;
        }
        // The result of a simple field is computed by Word as well.
        case 'fldSimple':
        case 'instrText':
          break;
        case 't':
          add(stringsOf(child), false);
          break;
        case 'delText':
          add(stringsOf(child), true);
          break;
        case 'tab':
          add('\t', false);
          break;
        case 'br':
          add('\n', false);
          break;
        case 'ins':
        case 'del': {
          const outer = change;
          const date = child.attrs['date'];
          change = {
            kind: child.name === 'ins' ? 'insertion' : 'deletion',
            author: child.attrs['author'] ?? '',
            ...(date !== undefined ? { date } : {}),
            text: '',
          };
          visit(child);
          if (change.text !== '') {
            trackedChanges.push({ ...change, ...(last !== undefined ? { block: last } : {}) });
          }
          change = outer;
          break;
        }
        case 'p':
          text = '';
          visit(child);
          paragraphs.push({ text, ...(last !== undefined ? { block: last } : {}) });
          text = '';
          break;
        default:
          visit(child);
      }
    }
  };
  visit(document);
  return { paragraphs, trackedChanges };
}

export type ReadBodyResult =
  | { readonly ok: true; readonly body: BodyText }
  | { readonly ok: false; readonly reason: ReadFailure; readonly message: string };

/** The body text of a DOCX, such as the one the exporter makes again from the reviewed version. */
export function readBodyText(bytes: Uint8Array): ReadBodyResult {
  const read = readDocx(bytes);
  return read.ok ? { ok: true, body: bodyText(read.parts.document) } : read;
}
