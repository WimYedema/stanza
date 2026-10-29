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
 * Makes a package a pure function of its content. The library stamps the core properties and the
 * zip entries with the current time and uses random relationship IDs and shared counters, so
 * those are rewritten.
 */
export function makeDeterministic(bytes: Uint8Array, timestamp: Date): Uint8Array {
  const files = unzipSync(bytes);
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
