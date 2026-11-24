import { unzipSync, strFromU8 } from 'fflate';
import { elementsOf, parseXml, type XmlElement } from './xml.js';

/** The largest XML part that is read, so that a small file cannot unpack into a huge one. */
const MAX_PART_BYTES = 64 * 1024 * 1024;

export interface Relationship {
  readonly target: string;
  readonly external: boolean;
}

export interface DocxParts {
  readonly document: XmlElement;
  readonly styles: XmlElement | undefined;
  readonly numbering: XmlElement | undefined;
  readonly footnotes: XmlElement | undefined;
  readonly endnotes: XmlElement | undefined;
  /** The comments of reviewers (`word/comments.xml`), read by `review.ts`. */
  readonly comments: XmlElement | undefined;
  /** Threads and resolved state of comments (`word/commentsExtended.xml`). */
  readonly commentsExtended: XmlElement | undefined;
  /** The durable IDs of comments (`word/commentsIds.xml`). */
  readonly commentsIds: XmlElement | undefined;
  /** The UTC times and reactions of comments (`word/commentsExtensible.xml`). */
  readonly commentsExtensible: XmlElement | undefined;
  /** The custom file properties (`docProps/custom.xml`), where the revision stamp is (ADR 0084). */
  readonly customProperties: XmlElement | undefined;
  /** The custom XML parts related from the main document, such as the embedded source. */
  readonly customXml: readonly XmlElement[];
  /** The properties of the document (`docProps/core.xml`). */
  readonly properties: XmlElement | undefined;
  /** The relationships of the main document, by ID. */
  readonly relationships: ReadonlyMap<string, Relationship>;
  /** The relationships of the comments part, by ID, for the links in comments (item 214). */
  readonly commentRelationships: ReadonlyMap<string, Relationship>;
}

export type ReadFailure = 'not-a-docx' | 'unreadable';

export type ReadResult =
  | { readonly ok: true; readonly parts: DocxParts }
  | { readonly ok: false; readonly reason: ReadFailure; readonly message: string };

const RELATIONSHIP_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PROPERTIES_TYPE =
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';

const fail = (reason: ReadFailure, message: string): ReadResult => ({ ok: false, reason, message });

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/** The path that a relationship target has inside the package, from the part that holds it. */
function resolveTarget(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const step of target.split('/')) {
    if (step === '..') parts.pop();
    else if (step !== '.' && step !== '') parts.push(step);
  }
  return parts.join('/');
}

interface RawRelationship extends Relationship {
  readonly type: string;
}

/** The path of the relationships of a part: `word/document.xml` has `word/_rels/document.xml.rels`. */
function relationshipsPath(part: string): string {
  const slash = part.lastIndexOf('/');
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

function relationshipsOf(
  files: Readonly<Record<string, Uint8Array>>,
  path: string,
): Map<string, RawRelationship> {
  const data = files[path];
  const list = new Map<string, RawRelationship>();
  if (data === undefined) return list;
  for (const entry of elementsOf(parseXml(strFromU8(data)), 'Relationship')) {
    const id = entry.attrs['Id'];
    const target = entry.attrs['Target'];
    if (id === undefined || target === undefined) continue;
    list.set(id, {
      type: entry.attrs['Type'] ?? '',
      target,
      external: entry.attrs['TargetMode'] === 'External',
    });
  }
  return list;
}

/** Opens a DOCX and parses the parts that the import reads. Refuses what is not a readable DOCX. */
export function readDocx(bytes: Uint8Array): ReadResult {
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    return fail(
      'not-a-docx',
      'This is an old Word file (.doc) or an encrypted file, not a DOCX. Open it in Word and save it as a DOCX without a password.',
    );
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => /\.(xml|rels)$/.test(file.name) && file.originalSize <= MAX_PART_BYTES,
    });
  } catch {
    return fail(
      'not-a-docx',
      'This is not a DOCX file: it is not a ZIP package, or it is damaged.',
    );
  }
  try {
    const rootRelations = relationshipsOf(files, '_rels/.rels');
    const main = [...rootRelations.values()].find(
      (entry) => entry.type === `${RELATIONSHIP_BASE}officeDocument`,
    );
    const documentPath = main === undefined ? 'word/document.xml' : resolveTarget('', main.target);
    const documentData = files[documentPath];
    if (documentData === undefined) {
      return fail('not-a-docx', 'This ZIP file has no Word document in it, so it is not a DOCX.');
    }
    const document = parseXml(strFromU8(documentData));
    if (document.name !== 'document') {
      return fail('not-a-docx', 'The main part of this file is not a Word document.');
    }
    const relations = relationshipsOf(files, relationshipsPath(documentPath));
    const partOf = (suffix: string, fallback?: string): XmlElement | undefined => {
      const type = suffix.includes('://') ? suffix : `${RELATIONSHIP_BASE}${suffix}`;
      const entry = [...relations.values()].find((r) => r.type === type);
      const path = entry === undefined ? fallback : resolveTarget(documentPath, entry.target);
      const data = path === undefined ? undefined : files[path];
      return data === undefined ? undefined : parseXml(strFromU8(data));
    };
    const commentsEntry = [...relations.values()].find(
      (r) => r.type === `${RELATIONSHIP_BASE}comments`,
    );
    const commentsPath =
      commentsEntry === undefined
        ? 'word/comments.xml'
        : resolveTarget(documentPath, commentsEntry.target);
    const commentRelations = relationshipsOf(files, relationshipsPath(commentsPath));
    const propertiesEntry = [...rootRelations.values()].find((r) => r.type === PROPERTIES_TYPE);
    const propertiesData = files[propertiesEntry?.target ?? 'docProps/core.xml'];
    const customEntry = [...rootRelations.values()].find(
      (r) => r.type === `${RELATIONSHIP_BASE}custom-properties`,
    );
    const customData = files[resolveTarget('', customEntry?.target ?? 'docProps/custom.xml')];
    const customXml = [...relations.values()]
      .filter((r) => r.type === `${RELATIONSHIP_BASE}customXml` && !r.external)
      .flatMap((r) => {
        const data = files[resolveTarget(documentPath, r.target)];
        return data === undefined ? [] : [parseXml(strFromU8(data))];
      });
    return {
      ok: true,
      parts: {
        document,
        styles: partOf('styles'),
        numbering: partOf('numbering'),
        footnotes: partOf('footnotes'),
        endnotes: partOf('endnotes'),
        comments: partOf('comments', 'word/comments.xml'),
        commentsExtended: partOf(
          'http://schemas.microsoft.com/office/2011/relationships/commentsExtended',
          'word/commentsExtended.xml',
        ),
        commentsIds: partOf(
          'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds',
          'word/commentsIds.xml',
        ),
        commentsExtensible: partOf(
          'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible',
          'word/commentsExtensible.xml',
        ),
        customProperties: customData === undefined ? undefined : parseXml(strFromU8(customData)),
        customXml,
        properties: propertiesData === undefined ? undefined : parseXml(strFromU8(propertiesData)),
        relationships: new Map(
          [...relations].map(([id, entry]) => [
            id,
            { target: entry.target, external: entry.external },
          ]),
        ),
        commentRelationships: new Map(
          [...commentRelations].map(([id, entry]) => [
            id,
            { target: entry.target, external: entry.external },
          ]),
        ),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail('unreadable', `The DOCX could not be read: ${reason}`);
  }
}
