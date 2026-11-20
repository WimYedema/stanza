import type { Diagnostic, DocumentMeta, MetaValue } from '@stanza/core';
import { parseDocument } from 'yaml';
import { LEGACY_FORMAT_CODE, LEGACY_FORMAT_KEY, LEGACY_FORMAT_MESSAGE } from './legacy.js';

export const FORMAT_VERSION = 1;

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const HARDCODED_KEYS = new Set(['stanza-format', 'title', 'authors', 'classification']);

export interface FrontMatter {
  readonly formatVersion: number | undefined;
  readonly meta: DocumentMeta;
}

/** Splits the source into front matter lines and the number of lines the front matter occupies. */
export function splitFrontMatter(lines: readonly string[]): {
  yaml: string | undefined;
  lineCount: number;
} {
  if (lines[0] !== '---') return { yaml: undefined, lineCount: 0 };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { yaml: undefined, lineCount: 0 };
  return { yaml: lines.slice(1, end).join('\n'), lineCount: end + 1 };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseFrontMatter(
  yaml: string,
  diagnostics: Diagnostic[],
  firstLine: number,
): FrontMatter {
  const report = (code: string, message: string, line = firstLine): void => {
    diagnostics.push({ severity: 'error', code, message, line });
  };
  const empty: FrontMatter = { formatVersion: undefined, meta: { fields: {} } };

  // The failsafe schema reads every scalar as a string, so `no` and dates are not reinterpreted.
  const document = parseDocument(yaml, { schema: 'failsafe' });
  for (const error of document.errors) {
    report('front-matter-invalid-yaml', error.message, firstLine + (error.linePos?.[0].line ?? 1));
  }
  if (document.errors.length > 0) return empty;

  const data: unknown = document.toJS();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    report('front-matter-invalid', 'Front matter must be a mapping.');
    return empty;
  }

  let formatVersion: number | undefined;
  let title: string | undefined;
  let classification: string | undefined;
  let authors: string[] | undefined;
  const fields: Record<string, MetaValue> = {};

  for (const [key, raw] of Object.entries(data)) {
    const value: unknown = raw ?? '';
    switch (key) {
      case 'stanza-format':
        if (typeof value === 'string' && /^\d+$/.test(value)) formatVersion = Number(value);
        else report('front-matter-invalid', '"stanza-format" must be a whole number.');
        break;
      case LEGACY_FORMAT_KEY:
        report(LEGACY_FORMAT_CODE, LEGACY_FORMAT_MESSAGE);
        break;
      case 'title':
        if (typeof value === 'string') title = value;
        else report('front-matter-invalid', '"title" must be a string.');
        break;
      case 'classification':
        if (typeof value === 'string') classification = value;
        else report('front-matter-invalid', '"classification" must be a string.');
        break;
      case 'authors':
        if (isStringList(value)) authors = value;
        else report('front-matter-invalid', '"authors" must be a list of strings.');
        break;
      default:
        if (!KEBAB_CASE.test(key)) {
          report('front-matter-invalid-key', `Field name "${key}" must be kebab-case.`);
        } else if (typeof value === 'string' || isStringList(value)) {
          fields[key] = value;
        } else {
          report('front-matter-invalid', `"${key}" must be a string or a list of strings.`);
        }
    }
  }

  return {
    formatVersion,
    meta: {
      ...(title !== undefined ? { title } : {}),
      ...(authors !== undefined ? { authors } : {}),
      ...(classification !== undefined ? { classification } : {}),
      fields,
    },
  };
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function entry(key: string, value: MetaValue): string[] {
  if (typeof value === 'string') return [`${key}: ${quote(value)}`];
  if (value.length === 0) return [`${key}: []`];
  return [`${key}:`, ...value.map((item) => `  - ${quote(item)}`)];
}

/** Front matter in canonical order, ending with the closing `---` line. */
export function serializeFrontMatter(meta: DocumentMeta): string[] {
  const lines = ['---', `stanza-format: ${String(FORMAT_VERSION)}`];
  if (meta.title !== undefined) lines.push(...entry('title', meta.title));
  if (meta.authors !== undefined) lines.push(...entry('authors', meta.authors));
  if (meta.classification !== undefined) {
    lines.push(...entry('classification', meta.classification));
  }
  for (const key of Object.keys(meta.fields).sort()) {
    const value = meta.fields[key];
    if (value !== undefined && !HARDCODED_KEYS.has(key)) lines.push(...entry(key, value));
  }
  lines.push('---');
  return lines;
}
