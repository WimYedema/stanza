import type { Diagnostic } from './diagnostic.js';
import type { DocumentMeta, MetaValue } from './document.js';

export type FieldType = 'string' | 'list';

export interface FieldDeclaration {
  readonly type: FieldType;
  readonly required: boolean;
  readonly label?: string;
}

export interface ProjectDefaults {
  readonly classification?: string;
  readonly authors?: readonly string[];
}

export interface ProjectSettings {
  readonly title?: string;
  /** Path of the stylesheet, relative to the project root. */
  readonly stylesheet: string;
  readonly defaults: ProjectDefaults;
  /** Undefined when the project declares nothing, in which case any field is accepted. */
  readonly fields: ReadonlyMap<string, FieldDeclaration> | undefined;
}

/** Names that belong to the hardcoded metadata and cannot be declared as custom fields. */
export const HARDCODED_FIELD_NAMES: readonly string[] = [
  'phrase-format',
  'title',
  'authors',
  'classification',
];

/** The metadata a document effectively has: its own values, then the project's defaults. */
export function applyDefaults(settings: ProjectSettings, meta: DocumentMeta): DocumentMeta {
  const classification = meta.classification ?? settings.defaults.classification;
  const authors = meta.authors ?? settings.defaults.authors;
  return {
    ...meta,
    ...(classification !== undefined ? { classification } : {}),
    ...(authors !== undefined ? { authors } : {}),
  };
}

function isEmpty(value: MetaValue): boolean {
  return typeof value === 'string' ? value === '' : value.length === 0;
}

/** Checks a document's custom metadata fields against the declarations of the project. */
export function validateMetadata(
  meta: DocumentMeta,
  settings: ProjectSettings,
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
    const value = meta.fields[name];
    if (value === undefined || isEmpty(value)) {
      if (declaration.required) {
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
    if (!declared.has(name)) {
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
function isSafeRelativePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '..');
}

/** Checks everything about the project settings that does not depend on how they were written. */
export function validateProjectSettings(settings: ProjectSettings): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
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
  return diagnostics;
}
