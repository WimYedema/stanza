import { strToU8, zipSync } from 'fflate';

/** Builds small DOCX files for the tests, from the XML of the parts that the import reads. */

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml"';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface DocxParts {
  /** The content of `<w:body>`. */
  readonly body: string;
  /** The `<w:style>` elements. */
  readonly styles?: string;
  /** The `<w:abstractNum>` and `<w:num>` elements. */
  readonly numbering?: string;
  /** The `<w:footnote>` elements. */
  readonly footnotes?: string;
  readonly endnotes?: string;
  /** Extra `<Relationship>` elements of the main document. */
  readonly relationships?: string;
  readonly title?: string;
}

const part = (root: string, content: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${root} ${NS}>${content}</w:${root}>`;

export function buildDocx(parts: DocxParts): Uint8Array {
  const rels = [
    parts.styles === undefined
      ? ''
      : `<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>`,
    parts.numbering === undefined
      ? ''
      : `<Relationship Id="rIdNum" Type="${REL}/numbering" Target="numbering.xml"/>`,
    parts.footnotes === undefined
      ? ''
      : `<Relationship Id="rIdFoot" Type="${REL}/footnotes" Target="footnotes.xml"/>`,
    parts.endnotes === undefined
      ? ''
      : `<Relationship Id="rIdEnd" Type="${REL}/endnotes" Target="endnotes.xml"/>`,
    parts.relationships ?? '',
  ].join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ),
    '_rels/.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    ),
    'word/document.xml': strToU8(part('document', `<w:body>${parts.body}</w:body>`)),
    'word/_rels/document.xml.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
        (parts.title === undefined ? '' : `<dc:title>${parts.title}</dc:title>`) +
        `</cp:coreProperties>`,
    ),
  };
  if (parts.styles !== undefined) files['word/styles.xml'] = strToU8(part('styles', parts.styles));
  if (parts.numbering !== undefined)
    files['word/numbering.xml'] = strToU8(part('numbering', parts.numbering));
  if (parts.footnotes !== undefined)
    files['word/footnotes.xml'] = strToU8(part('footnotes', parts.footnotes));
  if (parts.endnotes !== undefined)
    files['word/endnotes.xml'] = strToU8(part('endnotes', parts.endnotes));
  return zipSync(files);
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A run with text, and run properties as XML. */
export const run = (text: string, properties = ''): string =>
  `<w:r>${properties === '' ? '' : `<w:rPr>${properties}</w:rPr>`}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

/** A paragraph with content as XML, and paragraph properties as XML. */
export const para = (content: string, properties = ''): string =>
  `<w:p>${properties === '' ? '' : `<w:pPr>${properties}</w:pPr>`}${content}</w:p>`;

/** A paragraph of plain text in a style. */
export const text = (value: string, styleId?: string): string =>
  para(run(value), styleId === undefined ? '' : `<w:pStyle w:val="${styleId}"/>`);

/** A paragraph in a list, by number ID and level. */
export const item = (value: string, numId: string, level = 0): string =>
  para(
    run(value),
    `<w:numPr><w:ilvl w:val="${String(level)}"/><w:numId w:val="${numId}"/></w:numPr>`,
  );

interface StyleOptions {
  readonly type?: 'paragraph' | 'character';
  readonly basedOn?: string;
  readonly paragraph?: string;
  readonly run?: string;
}

export const style = (id: string, name: string, options: StyleOptions = {}): string =>
  `<w:style w:type="${options.type ?? 'paragraph'}" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (options.basedOn === undefined ? '' : `<w:basedOn w:val="${options.basedOn}"/>`) +
  (options.paragraph === undefined ? '' : `<w:pPr>${options.paragraph}</w:pPr>`) +
  (options.run === undefined ? '' : `<w:rPr>${options.run}</w:rPr>`) +
  `</w:style>`;

/** The heading styles of Word, with the names that Word gives them. */
export const HEADING_STYLES = [1, 2, 3, 4, 5, 6, 7]
  .map((level) => style(`Heading${String(level)}`, `heading ${String(level)}`))
  .join('');

/** A numbering definition with one format for every level, and the number that uses it. */
export const numbering = (numId: string, format: 'bullet' | 'decimal'): string =>
  `<w:abstractNum w:abstractNumId="${numId}">` +
  [0, 1, 2]
    .map((level) => `<w:lvl w:ilvl="${String(level)}"><w:numFmt w:val="${format}"/></w:lvl>`)
    .join('') +
  `</w:abstractNum><w:num w:numId="${numId}"><w:abstractNumId w:val="${numId}"/></w:num>`;
