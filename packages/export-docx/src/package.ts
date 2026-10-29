import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

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

export interface FinishOptions {
  /** Written into the package, so the same inputs give the same bytes. */
  readonly timestamp: Date;
  /** Word style IDs whose own `page-break-before` is set, and its value. */
  readonly pageBreaks: ReadonlyMap<string, boolean>;
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
