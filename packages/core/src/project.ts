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

/**
 * How an exported DOCX is protected (ADR 0085, refining ADR 0030): `comments` lets a reviewer only
 * comment, `none` lets Word for the web open it for comments at all.
 */
export type ReviewProtection = 'comments' | 'none';
export const REVIEW_PROTECTIONS: readonly ReviewProtection[] = ['comments', 'none'];

/** A sensitivity label of the tenant (ADR 0087), recorded from a file that Word labelled. */
export interface SensitivityLabel {
  /** The label ID, a GUID. */
  readonly id: string;
  /** The name of the label in the tenant, when the file gave it. */
  readonly name?: string;
}

/** The labels of a project (ADR 0087): one tenant, and a label per value of `classification`. */
export interface SensitivityLabels {
  /** The tenant ID (the `SiteId` of the label), a GUID. */
  readonly tenant: string;
  readonly labels: Readonly<Record<string, SensitivityLabel>>;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A GUID as the project file writes it: 36 characters, without braces. */
export const isGuid = (value: string): boolean => GUID.test(value);

/**
 * The label of a classification, or undefined when there is none or the project records no labels.
 * The classification is matched as written.
 */
export function labelOf(
  settings: Pick<ProjectSettings, 'sensitivityLabels'>,
  classification: string | undefined,
): SensitivityLabel | undefined {
  if (classification === undefined) return undefined;
  const labels = settings.sensitivityLabels?.labels;
  return labels !== undefined && Object.hasOwn(labels, classification)
    ? labels[classification]
    : undefined;
}

export interface ProjectSettings {
  readonly linkSchemes?: LinkSchemes;
  /** Absent when the project records no sensitivity labels (ADR 0087). */
  readonly sensitivityLabels?: SensitivityLabels;
  /** Absent means `comments`, as before ADR 0085. */
  readonly reviewProtection?: ReviewProtection;
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

/**
 * A warning when the project records sensitivity labels and the effective classification of a
 * document has none, so that its file goes out unlabelled (ADR 0087). A review document is never
 * built, so it is left out.
 */
function checkLabel(
  meta: DocumentMeta,
  settings: Pick<ProjectSettings, 'sensitivityLabels'>,
): Diagnostic[] {
  const recorded = settings.sensitivityLabels;
  if (recorded === undefined || Object.keys(recorded.labels).length === 0) return [];
  if (meta.reviews !== undefined || labelOf(settings, meta.classification) !== undefined) return [];
  const message =
    meta.classification === undefined
      ? 'The document has no classification, so its DOCX has no sensitivity label.'
      : `No sensitivity label is recorded for the classification "${meta.classification}", so its DOCX has none. Record one with "stanza label record".`;
  return [
    { severity: 'warning', code: 'unlabelled-classification', message, path: 'classification' },
  ];
}

/**
 * Checks a document's metadata against the project: its custom fields against the declarations,
 * and its classification against the recorded sensitivity labels. `meta` is the effective
 * metadata, with the project defaults applied.
 */
export function validateMetadata(
  meta: DocumentMeta,
  settings: Pick<ProjectSettings, 'fields'> & Partial<Pick<ProjectSettings, 'sensitivityLabels'>>,
): readonly Diagnostic[] {
  const labels = checkLabel(meta, settings);
  const declared = settings.fields;
  if (declared === undefined) return labels;
  const diagnostics: Diagnostic[] = [...labels];
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
  const recorded = settings.sensitivityLabels;
  if (recorded !== undefined) {
    const notGuid = (value: string, path: string, what: string): void => {
      if (isGuid(value)) return;
      diagnostics.push({
        severity: 'error',
        code: 'invalid-sensitivity-label',
        message: `The ${what} "${value}" is not a GUID. Record the label from a file with "stanza label record".`,
        path,
      });
    };
    notGuid(recorded.tenant, 'sensitivity-labels.tenant', 'tenant ID');
    for (const [classification, label] of Object.entries(recorded.labels)) {
      notGuid(label.id, `sensitivity-labels.labels.${classification}.id`, 'label ID');
    }
  }
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
