import type { Diagnostic } from './diagnostic.js';
import type { DocumentMeta, MetaValue } from './document.js';
import { validateLinkSchemes, type LinkSchemes } from './link-schemes.js';

export type FieldType = 'string' | 'list';

export interface FieldDeclaration {
  readonly type: FieldType;
  readonly required: boolean;
  readonly label?: string;
}

export interface ProjectDefaults {
  readonly classification?: string;
  readonly authors?: readonly string[];
  /** The page template of documents that do not select one. */
  readonly pageTemplate?: string;
}

/**
 * An entry of the outline of a project (ADR 0072): a document by its path, or a group with a title
 * that holds more entries. A group has no file; it only gives the documents a place.
 */
export type OutlineEntry =
  | { readonly kind: 'document'; readonly path: string }
  | { readonly kind: 'group'; readonly title: string; readonly items: readonly OutlineEntry[] };

/** The paths of the documents of an outline, in order, groups left out. */
export function outlinePaths(entries: readonly OutlineEntry[]): readonly string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'document' ? [entry.path] : outlinePaths(entry.items),
  );
}

export interface ProjectSettings {
  readonly linkSchemes?: LinkSchemes;
  readonly title?: string;
  /** Path of the stylesheet, relative to the project root. */
  readonly stylesheet: string;
  readonly defaults: ProjectDefaults;
  /** Undefined when the project declares nothing, in which case any field is accepted. */
  readonly fields: ReadonlyMap<string, FieldDeclaration> | undefined;
  /** The documents in order, with groups. Absent when not declared: all documents, by path. */
  readonly documents?: readonly OutlineEntry[];
}

/** Names that belong to the hardcoded metadata and cannot be declared as custom fields. */
export const HARDCODED_FIELD_NAMES: readonly string[] = [
  'stanza-format',
  'title',
  'authors',
  'classification',
  'reviews',
  'page-template',
];

/** The metadata a document effectively has: its own values, then the project's defaults. */
export function applyDefaults(
  settings: Pick<ProjectSettings, 'defaults'>,
  meta: DocumentMeta,
): DocumentMeta {
  const classification = meta.classification ?? settings.defaults.classification;
  const authors = meta.authors ?? settings.defaults.authors;
  const pageTemplate = meta.fields['page-template'] ?? settings.defaults.pageTemplate;
  return {
    ...meta,
    ...(classification !== undefined ? { classification } : {}),
    ...(authors !== undefined ? { authors } : {}),
    fields: {
      ...meta.fields,
      ...(pageTemplate !== undefined ? { 'page-template': pageTemplate } : {}),
    },
  };
}

function isEmpty(value: MetaValue): boolean {
  return typeof value === 'string' ? value === '' : value.length === 0;
}

/** Checks a document's custom metadata fields against the declarations of the project. */
export function validateMetadata(
  meta: DocumentMeta,
  settings: Pick<ProjectSettings, 'fields'>,
): readonly Diagnostic[] {
  const declared = settings.fields;
  if (declared === undefined) return [];
  const diagnostics: Diagnostic[] = [];
  const report = (
    severity: Diagnostic['severity'],
    code: string,
    message: string,
    name: string,
  ): void => {
    diagnostics.push({ severity, code, message, path: name });
  };

  for (const [name, declaration] of declared) {
    const value = Object.hasOwn(meta.fields, name) ? meta.fields[name] : undefined;
    if (value === undefined || isEmpty(value)) {
      // A review document is never built, so the fields a publication needs do not apply (ADR 0084).
      if (declaration.required && meta.reviews === undefined) {
        report('error', 'missing-field', `The field "${name}" is required.`, name);
      }
      continue;
    }
    const actual = typeof value === 'string' ? 'string' : 'list';
    if (actual !== declaration.type) {
      report(
        'error',
        'field-type-mismatch',
        `The field "${name}" must be a ${declaration.type}, not a ${actual}.`,
        name,
      );
    }
  }
  for (const name of Object.keys(meta.fields)) {
    if (!declared.has(name) && !HARDCODED_FIELD_NAMES.includes(name)) {
      report(
        'warning',
        'undeclared-field',
        `The field "${name}" is not declared by the project.`,
        name,
      );
    }
  }
  return diagnostics;
}

/** A project-relative path: forward slashes, not absolute, no `..`, not empty. */
export function isSafeRelativePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '..');
}

/** Checks everything about the project settings that does not depend on how they were written. */
export function validateProjectSettings(settings: ProjectSettings): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [...validateLinkSchemes(settings.linkSchemes ?? {})];
  if (!isSafeRelativePath(settings.stylesheet)) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-path',
      message: `"${settings.stylesheet}" must be a relative path with "/" separators and no "..".`,
      path: 'stylesheet',
    });
  }
  for (const name of settings.fields?.keys() ?? []) {
    if (HARDCODED_FIELD_NAMES.includes(name)) {
      diagnostics.push({
        severity: 'error',
        code: 'reserved-field-name',
        message: `"${name}" is a built-in field and cannot be declared.`,
        path: `metadata-fields.${name}`,
      });
    }
  }
  const listed = new Set<string>();
  for (const path of outlinePaths(settings.documents ?? [])) {
    if (!isSafeRelativePath(path)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-path',
        message: `"${path}" must be a relative path with "/" separators and no "..".`,
        path: 'documents',
      });
    } else if (listed.has(path)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-document',
        message: `The document "${path}" is listed more than once.`,
        path: 'documents',
      });
    }
    listed.add(path);
  }
  return diagnostics;
}
