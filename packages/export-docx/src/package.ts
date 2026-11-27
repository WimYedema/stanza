import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { addSourcePart, type FinishedStamp } from './stamp.js';

type Files = Record<string, Uint8Array>;

const STANDARD_ID = /^rId(\d+)$/;

function renameAttribute(text: string, attribute: string, renamed: Map<string, string>): string {
  return text.replace(
    new RegExp(` ${attribute}="([^"]+)"`, 'g'),
    (_whole, id: string) => ` ${attribute}="${renamed.get(id) ?? id}"`,
  );
}

/** The library gives hyperlinks random relationship IDs; they are renumbered in order of appearance. */
function renumberRelationships(files: Files): void {
  for (const [relsPath, rels] of Object.entries(files)) {
    const owner = /^word\/_rels\/(.+)\.rels$/.exec(relsPath)?.[1];
    const part = owner === undefined ? undefined : files[`word/${owner}`];
    if (owner === undefined || part === undefined) continue;

    const relsText = strFromU8(rels);
    const ids = [...relsText.matchAll(/ Id="([^"]+)"/g)].map((match) => match[1] ?? '');
    let next = Math.max(0, ...ids.map((id) => Number(STANDARD_ID.exec(id)?.[1] ?? 0))) + 1;
    const renamed = new Map<string, string>();
    for (const id of ids) {
      if (!STANDARD_ID.test(id)) renamed.set(id, `rId${String(next++)}`);
    }
    if (renamed.size === 0) continue;
    files[relsPath] = strToU8(renameAttribute(relsText, 'Id', renamed));
    files[`word/${owner}`] = strToU8(renameAttribute(strFromU8(part), 'r:id', renamed));
  }
}

/** The library numbers bookmarks from a counter shared by every export; they restart at 1. */
function renumberBookmarks(files: Files): void {
  const document = files['word/document.xml'];
  if (document === undefined) return;
  const numbers = new Map<string, number>();
  const text = strFromU8(document).replace(
    /<w:bookmark(Start|End)\b[^>]*>/g,
    (tag: string, kind: string) =>
      tag.replace(/ w:id="(\d+)"/, (_whole, id: string) => {
        if (kind === 'Start' && !numbers.has(id)) numbers.set(id, numbers.size + 1);
        return ` w:id="${String(numbers.get(id) ?? id)}"`;
      }),
  );
  files['word/document.xml'] = strToU8(text);
}

/**
 * The library cannot write `pageBreakBefore` into a paragraph style, so it is added to the
 * generated styles. In a style's `pPr` it comes after `pStyle`, `keepNext` and `keepLines`.
 */
function addPageBreaks(files: Files, pageBreaks: ReadonlyMap<string, boolean>): void {
  const styles = files['word/styles.xml'];
  if (styles === undefined || pageBreaks.size === 0) return;
  let text = strFromU8(styles);
  for (const [id, on] of pageBreaks) {
    const element = on ? '<w:pageBreakBefore/>' : '<w:pageBreakBefore w:val="0"/>';
    const style = new RegExp(`(<w:style [^>]*w:styleId="${id}"[^>]*>)(.*?)(</w:style>)`, 's');
    text = text.replace(style, (_whole, open: string, inner: string, close: string) => {
      const properties = /<w:pPr>(.*?)<\/w:pPr>/s.exec(inner);
      if (properties?.[1] !== undefined) {
        const content = properties[1];
        const lead =
          /^(?:<w:pStyle[^>]*\/>)?(?:<w:keepNext[^>]*\/>)?(?:<w:keepLines[^>]*\/>)?/.exec(
            content,
          )?.[0];
        const at = lead?.length ?? 0;
        const patched = `<w:pPr>${content.slice(0, at)}${element}${content.slice(at)}</w:pPr>`;
        return `${open}${inner.replace(properties[0], patched)}${close}`;
      }
      const empty = '<w:pPr/>';
      if (inner.includes(empty))
        return `${open}${inner.replace(empty, `<w:pPr>${element}</w:pPr>`)}${close}`;
      // A style's `pPr` comes before its `rPr`.
      const at = inner.search(/<w:rPr>|<w:rPr\/>/);
      const block = `<w:pPr>${element}</w:pPr>`;
      const patched = at < 0 ? inner + block : inner.slice(0, at) + block + inner.slice(at);
      return `${open}${patched}${close}`;
    });
  }
  files['word/styles.xml'] = strToU8(text);
}

/** How Word marks a picture as decorative, so that it needs no alternative text. */
const DECORATIVE =
  '<a:extLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
  '<a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}">' +
  '<adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/>' +
  '</a:ext></a:extLst>';

/**
 * The library numbers drawings from a counter shared by every export; they restart at 1. The
 * pictures of a cover are marked as decorative (ADR 0089).
 */
function renumberDrawings(files: Files): void {
  let next = 0;
  // The document first, then its headers and footers in the order of their names.
  const parts = [
    'word/document.xml',
    ...Object.keys(files)
      .filter((name) => /^word\/(header|footer)\d+\.xml$/.test(name))
      .sort(),
  ];
  for (const name of parts) {
    const part = files[name];
    if (part === undefined) continue;
    const text = strFromU8(part).replace(
      /<wp:docPr id="\d+"( name="[^"]*")\/>/g,
      (_whole, title: string) =>
        `<wp:docPr id="${String(++next)}"${title}>${DECORATIVE}</wp:docPr>`,
    );
    files[name] = strToU8(text);
  }
}

/**
 * Word ends a section with a paragraph. The one that ends a cover with rows gets a line of 1 pt
 * and no spacing, so that rows that fill the page leave room for it (ADR 0089). It is the first
 * paragraph that holds section properties.
 */
function shrinkCoverEnd(files: Files): void {
  const document = files['word/document.xml'];
  if (document === undefined) return;
  const end = '<w:p><w:pPr><w:sectPr>';
  const text = strFromU8(document);
  const at = text.indexOf(end);
  if (at < 0) throw new Error('The package has no cover section to end.');
  const small =
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>' +
    '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:sectPr>';
  // The background picture of the cover (ADR 0097) comes in a paragraph of its own just before;
  // its run moves into the end of the section, so it takes no line.
  let before = text.slice(0, at);
  let runs = '';
  const start = Math.max(before.lastIndexOf('<w:p>'), before.lastIndexOf('<w:p '));
  const last = start < 0 ? '' : before.slice(start);
  if (last.endsWith('</w:p>') && last.includes('behindDoc="1"')) {
    const open = last.includes('</w:pPr>')
      ? last.indexOf('</w:pPr>') + '</w:pPr>'.length
      : last.indexOf('>') + 1;
    runs = last.slice(open, last.length - '</w:p>'.length);
    before = before.slice(0, start);
  }
  let after = text.slice(at + end.length);
  if (runs !== '') {
    const close = after.indexOf('</w:pPr>') + '</w:pPr>'.length;
    after = after.slice(0, close) + runs + after.slice(close);
  }
  files['word/document.xml'] = strToU8(before + small + after);
}

export interface FinishOptions {
  /** Written into the package, so the same inputs give the same bytes. */
  readonly timestamp: Date;
  /** Word style IDs whose own `page-break-before` is set, and its value. */
  readonly pageBreaks: ReadonlyMap<string, boolean>;
  /** The width of the text on the page, where the page numbers of a table of contents align. */
  readonly textWidthTwips: number;
  /** Whether the package is protected for comments (ADR 0030) or not at all (ADR 0085). */
  readonly protection: 'comments' | 'none';
  /** The source to embed as a custom XML part (ADR 0084), if any. */
  readonly source?: FinishedStamp;
  /** The document starts with a cover of rows, whose section end is made small (ADR 0089). */
  readonly coverRows?: boolean;
}

/**
 * The library puts the page numbers of a table of contents at a fixed A4 position, with a
 * `clear` tab for the one Word's own style would have. The styles here have no such tab, so the
 * pair is replaced by one right tab at the end of the text.
 */
function alignTocPageNumbers(files: Files, textWidthTwips: number): void {
  const document = files['word/document.xml'];
  if (document === undefined) return;
  files['word/document.xml'] = strToU8(
    strFromU8(document).replace(
      /<w:tab w:val="clear" w:pos="\d+"\/><w:tab w:val="right" w:pos="9025" w:leader="dot"\/>/g,
      `<w:tab w:val="right" w:pos="${String(textWidthTwips)}" w:leader="dot"/>`,
    ),
  );
}

/**
 * Protects the document for comments: a reviewer can add comments and change nothing else. No
 * password is set, so this guards against slips and is lifted in Word's Restrict Editing pane
 * (ADR 0030). The element comes before the default tab stop in the settings.
 */
function addReviewProtection(files: Files): void {
  const settings = files['word/settings.xml'];
  const text = settings === undefined ? '' : strFromU8(settings);
  const at = text.indexOf('<w:defaultTabStop');
  if (at < 0) {
    throw new Error('The settings of the package have no place for the review protection.');
  }
  const protection = '<w:documentProtection w:edit="comments" w:enforcement="1"/>';
  files['word/settings.xml'] = strToU8(`${text.slice(0, at)}${protection}${text.slice(at)}`);
}

/**
 * Finishes a package: adds what the library cannot write, and makes it a pure function of its
 * content. The library stamps the core properties and the zip entries with the current time and
 * uses random relationship IDs and shared counters, so those are rewritten.
 */
export function finishPackage(bytes: Uint8Array, options: FinishOptions): Uint8Array {
  const { timestamp } = options;
  const files = unzipSync(bytes);
  addPageBreaks(files, options.pageBreaks);
  alignTocPageNumbers(files, options.textWidthTwips);
  if (options.protection === 'comments') addReviewProtection(files);
  if (options.source !== undefined) addSourcePart(files, options.source);
  if (options.coverRows === true) shrinkCoverEnd(files);
  const core = files['docProps/core.xml'];
  if (core !== undefined) {
    const iso = timestamp.toISOString();
    files['docProps/core.xml'] = strToU8(
      strFromU8(core).replace(
        /(<dcterms:(?:created|modified)\b[^>]*>)[^<]*/g,
        (_match, open: string) => `${open}${iso}`,
      ),
    );
  }
  renumberRelationships(files);
  renumberBookmarks(files);
  renumberDrawings(files);
  // Zip entry times are local wall-clock values, so the UTC fields are used as such.
  const mtime = new Date(
    timestamp.getUTCFullYear(),
    timestamp.getUTCMonth(),
    timestamp.getUTCDate(),
    timestamp.getUTCHours(),
    timestamp.getUTCMinutes(),
    timestamp.getUTCSeconds(),
  );
  return zipSync(files, { mtime });
}
