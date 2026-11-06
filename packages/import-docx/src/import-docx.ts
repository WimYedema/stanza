import { normalizeDocument, type Block, type Document, type DocumentMeta } from '@phrase/core';
import { convertBody } from './blocks.js';
import { ImportContext } from './context.js';
import { readDocx, type ReadFailure } from './docx-package.js';
import { DocxNumbering } from './numbering.js';
import { Reporter, type ImportReport } from './report.js';
import { DocxStyles } from './styles.js';
import { childOf, elementsOf, plainText, type XmlElement } from './xml.js';

export type ImportResult =
  | { readonly ok: true; readonly document: Document; readonly report: ImportReport }
  | { readonly ok: false; readonly reason: ReadFailure; readonly message: string };

/** The text of each footnote or endnote by ID, without the separators that Word keeps in the same part. */
function notesOf(part: XmlElement | undefined, name: string): Map<string, string> {
  const notes = new Map<string, string>();
  for (const note of elementsOf(part, name)) {
    const id = note.attrs['id'];
    const type = note.attrs['type'];
    if (id === undefined || (type !== undefined && type !== 'normal')) continue;
    notes.set(id, plainText(note));
  }
  return notes;
}

function titleOf(properties: XmlElement | undefined, blocks: readonly Block[]): string | undefined {
  const fromProperties = childOf(properties, 'title')
    ?.children.filter((child) => typeof child === 'string')
    .join('')
    .trim();
  if (fromProperties !== undefined && fromProperties !== '') return fromProperties;
  const heading = blocks.find((block) => block.type === 'heading');
  const text = heading?.content.map((inline) => inline.text).join('');
  return text === undefined || text === '' ? undefined : text;
}

/**
 * Reads a DOCX once and returns the content of its body as a document of the project, with a
 * report of what could not be carried over (ADR 0043). Nothing of the look comes across, and no
 * IDs are assigned: that is for the host that writes the file.
 */
export function importDocx(bytes: Uint8Array): ImportResult {
  const read = readDocx(bytes);
  if (!read.ok) return read;
  const { parts } = read;
  const body = childOf(parts.document, 'body');
  if (body === undefined) {
    return { ok: false, reason: 'not-a-docx', message: 'The Word document has no body.' };
  }
  const styles = new DocxStyles(parts.styles);
  const report = new Reporter();
  const context = new ImportContext(
    styles,
    new DocxNumbering(parts.numbering, styles),
    parts.relationships,
    notesOf(parts.footnotes, 'footnote'),
    notesOf(parts.endnotes, 'endnote'),
    report,
  );
  const blocks = convertBody(body, context);
  const title = titleOf(parts.properties, blocks);
  const meta: DocumentMeta = title === undefined ? { fields: {} } : { title, fields: {} };
  return { ok: true, document: normalizeDocument({ meta, blocks }), report: report.report() };
}
