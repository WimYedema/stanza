import type { Diagnostic, Document, DocumentMeta } from '@stanza/core';
import MarkdownIt from 'markdown-it';
import { parseDocument as parseYaml } from 'yaml';
import { splitFrontMatter } from './front-matter.js';
import { parseMarkdownBlocks } from './parse.js';

export interface AdoptDiagnostic {
  /** `warning` is content that is gone; `info` is content kept in another form. */
  readonly severity: 'info' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly count: number;
  /** Where it happened, for the first few cases, such as `line 12`. */
  readonly places: readonly string[];
}

export interface AdoptReport {
  readonly diagnostics: readonly AdoptDiagnostic[];
}

export type AdoptResult =
  | { readonly ok: true; readonly document: Document; readonly report: AdoptReport }
  | { readonly ok: false; readonly reason: 'already-stanza'; readonly message: string };

// Unlike the dialect reader, reference links are on: they become ordinary links.
const markdown = new MarkdownIt('commonmark', { html: true }).enable('table');

const MAX_PLACES = 10;

/** The wording of what the reader reports, and whether the content is gone (`warning`) or kept. */
const CODES: Readonly<Record<string, { severity: 'info' | 'warning'; message: string }>> = {
  'front-matter-unreadable': {
    severity: 'warning',
    message: 'The front matter could not be read as YAML and was left out.',
  },
  'thematic-break-unsupported': {
    severity: 'warning',
    message: 'Thematic breaks (horizontal rules) were left out.',
  },
  'html-unsupported': {
    severity: 'warning',
    message: 'Raw HTML blocks, comments included, were left out.',
  },
  'inline-html-unsupported': {
    severity: 'warning',
    message: 'Raw inline HTML tags were left out; the text between them was kept.',
  },
  'unsupported-block': {
    severity: 'warning',
    message: 'Blocks of a kind that the dialect does not have were left out.',
  },
  'unsupported-inline': {
    severity: 'warning',
    message: 'Inline content of a kind that the dialect does not have was left out.',
  },
  'blockquote-unsupported': {
    severity: 'info',
    message: 'Block quotes were written as ordinary blocks.',
  },
  'hard-break-unsupported': { severity: 'info', message: 'Hard line breaks became a space.' },
  'image-unsupported': { severity: 'info', message: 'Images were replaced by their alt text.' },
  'link-title-unsupported': { severity: 'info', message: 'Link titles were left out.' },
  'table-alignment-unsupported': { severity: 'info', message: 'Column alignment was left out.' },
  'list-start-unsupported': {
    severity: 'info',
    message: 'A numbered list that did not start at 1 now does.',
  },
  'fence-info-ignored': {
    severity: 'info',
    message: 'Words after the language of a code fence were left out.',
  },
  'heading-in-list': {
    severity: 'info',
    message: 'A heading in a list item became a paragraph.',
  },
  'reference-links': {
    severity: 'info',
    message: 'Reference links were turned into ordinary links.',
  },
  'front-matter-keys': { severity: 'info', message: 'Front matter keys were left out.' },
};

/** The order in which the report lists the codes; others follow in the order they were found. */
const ORDER = Object.keys(CODES);

interface Entry {
  readonly severity: 'info' | 'warning';
  readonly message: string;
  count: number;
  readonly places: string[];
}

class Collector {
  private readonly entries = new Map<string, Entry>();

  add(code: string, count = 1, places: readonly string[] = [], fallback?: Diagnostic): void {
    const known = CODES[code];
    let entry = this.entries.get(code);
    if (entry === undefined) {
      entry = {
        severity: known?.severity ?? (fallback?.severity === 'error' ? 'warning' : 'info'),
        message: known?.message ?? fallback?.message ?? code,
        count: 0,
        places: [],
      };
      this.entries.set(code, entry);
    }
    entry.count += count;
    for (const place of places) if (entry.places.length < MAX_PLACES) entry.places.push(place);
  }

  report(): AdoptReport {
    const codes = [...this.entries.keys()].sort((a, b) => {
      const [x, y] = [ORDER.indexOf(a), ORDER.indexOf(b)];
      return (x === -1 ? ORDER.length : x) - (y === -1 ? ORDER.length : y);
    });
    return {
      diagnostics: codes.flatMap((code) => {
        const entry = this.entries.get(code);
        if (entry === undefined) return [];
        const { severity, message, count, places } = entry;
        return [{ severity, code, message, count, places }];
      }),
    };
  }
}

/** The title and the keys of front matter that is not a Stanza file's. */
function readFrontMatter(
  yaml: string,
): { ok: true; title: string | undefined; keys: string[] } | { ok: false; stanza: boolean } {
  const document = parseYaml(yaml, { schema: 'failsafe' });
  if (document.errors.length > 0) return { ok: false, stanza: false };
  const data: unknown = document.toJS();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, stanza: false };
  }
  if ('stanza-format' in data) return { ok: false, stanza: true };
  const title = (data as Record<string, unknown>)['title'];
  return {
    ok: true,
    title: typeof title === 'string' && title.trim() !== '' ? title.trim() : undefined,
    keys: Object.keys(data).filter((key) => key !== 'title'),
  };
}

/**
 * Reads an ordinary Markdown file as a Stanza document (ADR 0060): the dialect reader with
 * reference links switched on, and a report of what the dialect cannot hold. A file that is
 * already a Stanza document is refused.
 */
export function adoptMarkdown(source: string): AdoptResult {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const collect = new Collector();

  const { yaml, lineCount } = splitFrontMatter(lines);
  let meta: DocumentMeta = { fields: {} };
  if (yaml !== undefined) {
    const front = readFrontMatter(yaml);
    if (!front.ok && front.stanza) {
      return {
        ok: false,
        reason: 'already-stanza',
        message: 'The file has "stanza-format" in its front matter, so it is a Stanza document.',
      };
    }
    if (!front.ok) collect.add('front-matter-unreadable', 1, ['line 1']);
    else {
      if (front.title !== undefined) meta = { ...meta, title: front.title };
      if (front.keys.length > 0) collect.add('front-matter-keys', front.keys.length, front.keys);
    }
  }

  const diagnostics: Diagnostic[] = [];
  const env: { references?: Record<string, unknown> } = {};
  const blocks = parseMarkdownBlocks(
    lines.slice(lineCount).join('\n'),
    markdown,
    env,
    lineCount,
    diagnostics,
  );
  for (const d of diagnostics) {
    collect.add(d.code, 1, d.line === undefined ? [] : [`line ${String(d.line)}`], d);
  }
  const definitions = Object.keys(env.references ?? {}).map((label) => label.toLowerCase());
  if (definitions.length > 0) collect.add('reference-links', definitions.length, definitions);

  return { ok: true, document: { meta, blocks }, report: collect.report() };
}
