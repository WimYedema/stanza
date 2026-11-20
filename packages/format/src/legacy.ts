/**
 * Files from before Phrase was renamed to Stanza (ADR 0083). They are not read as documents,
 * project files or stylesheets: they get the `legacy-format` diagnostic, and `stanza migrate`
 * rewrites them with the functions here. Nothing else may use the old names.
 */

/** The front matter and YAML key of the old files. */
export const LEGACY_FORMAT_KEY = 'phrase-format';

export const LEGACY_FORMAT_CODE = 'legacy-format';

export const LEGACY_FORMAT_MESSAGE =
  'The file is from before Phrase was renamed to Stanza. Run "stanza migrate" on its project (ADR 0083).';

/** The result of rewriting one file: the new text and how many places changed. */
export interface LegacyRewrite {
  readonly text: string;
  readonly changes: number;
}

const FORMAT_LINE = /^phrase-format(\s*:)/;
const ANNOTATION = /^(\s*<!--\s*)phrase:(.*-->\s*)$/;
const FENCE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
/** A link destination that names a document file, with an optional fragment and title. */
const DOCUMENT_LINK = /\]\(([^()\s]*?)\.phrase\.md((?:#[^()\s]*)?(?:\s+"[^"]*")?)\)/g;
/** A slot or metadata link, `[label](phrase:token)`. */
const TOKEN_LINK = /\]\(phrase:/g;
const LINK_DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s*)(\S*?)\.phrase\.md(#\S*)?(\s|$)/;

/** Applies `rewrite` to the parts of a line outside inline code spans. */
function outsideCode(line: string, rewrite: (part: string) => string): string {
  let out = '';
  let rest = line;
  for (;;) {
    const open = /`+/.exec(rest);
    if (open === null) return out + rewrite(rest);
    const ticks = open[0];
    const after = rest.slice(open.index + ticks.length);
    const close = new RegExp(`(?<!\`)${ticks}(?!\`)`).exec(after);
    if (close === null) return out + rewrite(rest);
    out += rewrite(rest.slice(0, open.index)) + ticks + after.slice(0, close.index + ticks.length);
    rest = after.slice(close.index + ticks.length);
  }
}

/** Rewrites the links of one line of text, counting each change. */
function rewriteLinks(line: string, count: () => void): string {
  const definition = LINK_DEFINITION.exec(line);
  if (definition !== null) {
    count();
    const [whole, lead = '', path = '', fragment = '', end = ''] = definition;
    return `${lead}${path}.stanza.md${fragment}${end}${line.slice(whole.length)}`;
  }
  return outsideCode(line, (part) =>
    part
      .replace(DOCUMENT_LINK, (_whole, path: string, rest: string) => {
        count();
        return `](${path}.stanza.md${rest})`;
      })
      .replace(TOKEN_LINK, () => {
        count();
        return '](stanza:';
      }),
  );
}

/**
 * Rewrites a Phrase document as a Stanza document: the format key in the front matter, block
 * annotations, the names of semantic fences, and links to `.phrase.md` files or `phrase:`
 * tokens. Ordinary code fences and inline code are left as they are, so examples of the old
 * syntax stay intact. IDs and everything else are unchanged.
 */
export function migrateLegacyDocument(source: string): LegacyRewrite {
  const lines = source.split('\n');
  let changes = 0;
  const count = (): void => {
    changes += 1;
  };
  let index = 0;
  if (lines[0]?.replace(/\r$/, '') === '---') {
    for (index = 1; index < lines.length; index++) {
      const line = lines[index] ?? '';
      if (line.replace(/\r$/, '') === '---') {
        index += 1;
        break;
      }
      if (FORMAT_LINE.test(line)) {
        lines[index] = line.replace(FORMAT_LINE, 'stanza-format$1');
        count();
      }
    }
  }
  let fence: { marker: string; semantic: boolean } | undefined;
  for (; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const opening = FENCE.exec(line);
    if (fence !== undefined) {
      const closing =
        opening !== null &&
        opening[2]?.[0] === fence.marker[0] &&
        (opening[2]?.length ?? 0) >= fence.marker.length &&
        (opening[3] ?? '').trim() === '';
      if (closing) fence = undefined;
      else if (fence.semantic) lines[index] = rewriteBodyLine(line, count);
      continue;
    }
    if (opening !== null) {
      const [, indent = '', marker = '', info = ''] = opening;
      const semantic = info.startsWith('phrase-');
      if (semantic) {
        lines[index] = `${indent}${marker}stanza-${info.slice('phrase-'.length)}`;
        count();
      }
      fence = { marker, semantic };
      continue;
    }
    lines[index] = rewriteBodyLine(line, count);
  }
  return { text: lines.join('\n'), changes };
}

/** A line of content: an annotation, or text whose links may need rewriting. */
function rewriteBodyLine(line: string, count: () => void): string {
  const annotation = ANNOTATION.exec(line);
  if (annotation === null) return rewriteLinks(line, count);
  count();
  return `${annotation[1] ?? ''}stanza:${annotation[2] ?? ''}`;
}

/**
 * Rewrites a Phrase project file or stylesheet: the top-level format key, `phrase:` token links
 * in slots, and `.phrase.md` paths, such as those of the document list. Comments and layout stay.
 */
export function migrateLegacyYaml(source: string): LegacyRewrite {
  let changes = 0;
  const lines = source.split('\n').map((line) => {
    let next = line;
    if (FORMAT_LINE.test(next)) {
      next = next.replace(FORMAT_LINE, 'stanza-format$1');
      changes += 1;
    }
    return next
      .replace(/\(phrase:/g, () => {
        changes += 1;
        return '(stanza:';
      })
      .replace(/\.phrase\.md\b/g, () => {
        changes += 1;
        return '.stanza.md';
      });
  });
  return { text: lines.join('\n'), changes };
}
