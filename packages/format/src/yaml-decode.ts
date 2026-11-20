import { isStyleName, type Diagnostic, type StyleName } from '@stanza/core';
import { parseDocument } from 'yaml';
import { FORMAT_VERSION } from './front-matter.js';
import { LEGACY_FORMAT_CODE, LEGACY_FORMAT_KEY, LEGACY_FORMAT_MESSAGE } from './legacy.js';

/** Shared helpers for reading the YAML files of a project (stylesheet, project file). */

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type Report = (code: string, message: string, path: string) => void;
export type Data = Readonly<Record<string, unknown>>;

export const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

export function readName(
  map: Data,
  key: string,
  path: string,
  report: Report,
): StyleName | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && isStyleName(value)) return value;
  report('invalid-value', 'Expected a kebab-case style name.', join(path, key));
  return undefined;
}

export function describe(value: unknown): string {
  if (value === null || value === undefined) {
    return 'nothing (a `#` starts a comment in YAML, so quote color values)';
  }
  return Array.isArray(value) ? 'a list' : typeof value;
}

export function asMap(value: unknown, path: string, report: Report): Data | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Data;
  }
  report('invalid-type', `Expected a mapping, found ${describe(value)}.`, path);
  return undefined;
}

export function checkKeys(
  map: Data,
  allowed: readonly string[],
  path: string,
  report: Report,
): void {
  for (const key of Object.keys(map)) {
    if (!allowed.includes(key)) {
      report('unknown-property', `Unknown property "${key}".`, join(path, key));
    }
  }
}

export function readNumber(
  map: Data,
  key: string,
  path: string,
  report: Report,
): number | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  report('invalid-type', `Expected a number, found ${describe(value)}.`, join(path, key));
  return undefined;
}

export function readBoolean(
  map: Data,
  key: string,
  path: string,
  report: Report,
): boolean | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  report('invalid-type', `Expected true or false, found ${describe(value)}.`, join(path, key));
  return undefined;
}

export function readString(
  map: Data,
  key: string,
  path: string,
  report: Report,
): string | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  report('invalid-type', `Expected a string, found ${describe(value)}.`, join(path, key));
  return undefined;
}

export function isNonEmptyStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
  );
}

/**
 * Parses YAML text into its top-level mapping. Problems are added to `diagnostics`;
 * undefined is returned when there is no usable mapping.
 */
export function readYamlRoot(source: string, diagnostics: Diagnostic[]): Data | undefined {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const document = parseDocument(text);
  for (const error of document.errors) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-yaml',
      message: error.message,
      ...(error.linePos !== undefined ? { line: error.linePos[0].line } : {}),
    });
  }
  if (document.errors.length > 0) return undefined;
  const report: Report = (code, message, path) => {
    diagnostics.push({ severity: 'error', code, message, path });
  };
  return asMap(document.toJS(), '', report);
}

/**
 * Reports a file from before the rename to Stanza (ADR 0083), which has `phrase-format` and no
 * `stanza-format`. Such a file is not read further, so its other keys give no diagnostics.
 */
export function reportLegacyFormat(data: Data, report: Report): boolean {
  if (data['stanza-format'] !== undefined || data[LEGACY_FORMAT_KEY] === undefined) return false;
  report(LEGACY_FORMAT_CODE, LEGACY_FORMAT_MESSAGE, LEGACY_FORMAT_KEY);
  return true;
}

/** Reads and checks the `stanza-format` property. */
export function readFormatVersion(data: Data, report: Report): number | undefined {
  const version = data['stanza-format'];
  const formatVersion =
    typeof version === 'number' && Number.isInteger(version) ? version : undefined;
  if (formatVersion === undefined) {
    report(
      'format-version-missing',
      'The file must contain a whole number "stanza-format".',
      'stanza-format',
    );
  } else if (formatVersion !== FORMAT_VERSION) {
    report(
      'format-version-unsupported',
      `Format version ${String(formatVersion)} is not supported (expected ${String(FORMAT_VERSION)}).`,
      'stanza-format',
    );
  }
  return formatVersion;
}
