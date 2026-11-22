import {
  SOURCE_PART_NAMESPACE,
  SOURCE_STAMP_PROPERTIES,
  contentHash,
  normalizeLineEndings,
  type SourceStamp,
} from '@stanza/core';
import { strFromU8, strToU8 } from 'fflate';

type Files = Record<string, Uint8Array>;

/** The stamp as the package is finished with it: the text normalised and its hash. */
export interface FinishedStamp {
  readonly path: string;
  readonly text: string;
  readonly hash: string;
}

export function finishedStamp(stamp: SourceStamp): FinishedStamp {
  return {
    path: stamp.path,
    text: normalizeLineEndings(stamp.text),
    hash: contentHash(stamp.text),
  };
}

/**
 * The custom file properties of the stamp (ADR 0084): the document, the commit and whether the
 * document had uncommitted changes when the host knows them, and the content hash.
 */
export function stampProperties(
  stamp: SourceStamp,
  finished: FinishedStamp,
): { name: string; value: string }[] {
  const names = SOURCE_STAMP_PROPERTIES;
  return [
    { name: names.document, value: stamp.path },
    ...(stamp.revision !== undefined
      ? [
          { name: names.commit, value: stamp.revision.commit },
          { name: names.dirty, value: String(stamp.revision.dirty) },
        ]
      : []),
    { name: names.contentHash, value: finished.hash },
  ];
}

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (text: string): string => escapeText(text).replace(/"/g, '&quot;');

const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** A GUID made from the content hash, so that the part's ID is the same for the same source. */
function itemId(hash: string): string {
  const hex = hash.replace(/^sha256:/, '').slice(0, 32);
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}}`.toUpperCase();
}

function addRelationship(files: Files, relsPath: string, relationship: string): void {
  const rels = files[relsPath];
  if (rels === undefined) throw new Error(`The package has no ${relsPath}.`);
  files[relsPath] = strToU8(
    strFromU8(rels).replace('</Relationships>', `${relationship}</Relationships>`),
  );
}

function addOverride(files: Files, partName: string, contentType: string): void {
  const types = files['[Content_Types].xml'];
  if (types === undefined) throw new Error('The package has no [Content_Types].xml.');
  const text = strFromU8(types);
  if (text.includes(`PartName="${partName}"`)) return;
  files['[Content_Types].xml'] = strToU8(
    text.replace(
      '</Types>',
      `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`,
    ),
  );
}

/**
 * Adds the source text of the document as a custom XML part, which Word keeps and does not show
 * (`spike-findings`), so that a pull can regenerate the reviewed version without Git (ADR 0084).
 * The relationship is given a non-standard ID, which the renumbering of the package then turns
 * into the next free `rIdN`.
 */
export function addSourcePart(files: Files, stamp: FinishedStamp): void {
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  files['customXml/item1.xml'] = strToU8(
    `${declaration}<source xmlns="${SOURCE_PART_NAMESPACE}" path="${escapeAttribute(stamp.path)}" hash="${stamp.hash}">${escapeText(stamp.text)}</source>`,
  );
  files['customXml/itemProps1.xml'] = strToU8(
    `${declaration}<ds:datastoreItem ds:itemID="${itemId(stamp.hash)}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${SOURCE_PART_NAMESPACE}"/></ds:schemaRefs></ds:datastoreItem>`,
  );
  files['customXml/_rels/item1.xml.rels'] = strToU8(
    `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELATIONSHIPS}/customXmlProps" Target="itemProps1.xml"/></Relationships>`,
  );
  addRelationship(
    files,
    'word/_rels/document.xml.rels',
    `<Relationship Id="stanzaSource" Type="${RELATIONSHIPS}/customXml" Target="../customXml/item1.xml"/>`,
  );
  addOverride(
    files,
    '/customXml/itemProps1.xml',
    'application/vnd.openxmlformats-officedocument.customXmlProperties+xml',
  );
  addOverride(files, '/customXml/item1.xml', 'application/xml');
}
