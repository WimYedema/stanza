import {
  validateProjectSettings,
  type Diagnostic,
  type FieldDeclaration,
  type FieldType,
  type ProjectDefaults,
  type ProjectSettings,
} from '@phrase/core';
import {
  KEBAB_CASE,
  asMap,
  checkKeys,
  describe,
  isNonEmptyStringList,
  join,
  readBoolean,
  readFormatVersion,
  readString,
  readYamlRoot,
  type Data,
  type Mutable,
  type Report,
} from './yaml-decode.js';

export interface ProjectParseResult {
  readonly settings: ProjectSettings;
  readonly diagnostics: readonly Diagnostic[];
  /** The `phrase-format` value found in the file, when there was one. */
  readonly formatVersion: number | undefined;
}

const EMPTY: ProjectSettings = { stylesheet: '', defaults: {}, fields: undefined };
const FIELD_TYPES: readonly string[] = ['string', 'list'];

function readDefaults(data: Data, report: Report): ProjectDefaults {
  const raw = data['defaults'];
  if (raw === undefined) return {};
  const map = asMap(raw, 'defaults', report);
  if (map === undefined) return {};
  checkKeys(map, ['classification', 'authors'], 'defaults', report);
  const result: Mutable<ProjectDefaults> = {};
  const classification = readString(map, 'classification', 'defaults', report);
  if (classification !== undefined) result.classification = classification;
  const authors = map['authors'];
  if (authors !== undefined) {
    if (isNonEmptyStringList(authors)) result.authors = authors;
    else {
      report(
        'invalid-type',
        `Expected a non-empty list of names, found ${describe(authors)}.`,
        'defaults.authors',
      );
    }
  }
  return result;
}

function readField(map: Data, path: string, report: Report): FieldDeclaration | undefined {
  checkKeys(map, ['type', 'required', 'label'], path, report);
  const type = map['type'];
  let fieldType: FieldType | undefined;
  if (typeof type === 'string' && FIELD_TYPES.includes(type)) {
    fieldType = type as FieldType;
  } else {
    report('invalid-value', 'Expected the type "string" or "list".', join(path, 'type'));
  }
  const required = readBoolean(map, 'required', path, report);
  const label = readString(map, 'label', path, report);
  if (fieldType === undefined) return undefined;
  return {
    type: fieldType,
    required: required ?? false,
    ...(label !== undefined ? { label } : {}),
  };
}

function readFields(data: Data, report: Report): ReadonlyMap<string, FieldDeclaration> | undefined {
  const raw = data['metadata-fields'];
  if (raw === undefined) return undefined;
  const map = asMap(raw, 'metadata-fields', report);
  if (map === undefined) return undefined;
  const fields = new Map<string, FieldDeclaration>();
  for (const [name, value] of Object.entries(map)) {
    const path = join('metadata-fields', name);
    if (!KEBAB_CASE.test(name)) {
      report('invalid-value', `"${name}" is not a kebab-case field name.`, path);
      continue;
    }
    const declaration = asMap(value, path, report);
    if (declaration === undefined) continue;
    const field = readField(declaration, path, report);
    if (field !== undefined) fields.set(name, field);
  }
  return fields;
}

/** Reads a project file. Problems in the file are reported and the rest is still read. */
export function parseProject(source: string): ProjectParseResult {
  const diagnostics: Diagnostic[] = [];
  const report: Report = (code, message, path) => {
    diagnostics.push({ severity: 'error', code, message, path });
  };

  const data = readYamlRoot(source, diagnostics);
  if (data === undefined) return { settings: EMPTY, diagnostics, formatVersion: undefined };

  checkKeys(
    data,
    ['phrase-format', 'title', 'stylesheet', 'defaults', 'metadata-fields'],
    '',
    report,
  );
  const formatVersion = readFormatVersion(data, report);

  const title = readString(data, 'title', '', report);
  const stylesheet = readString(data, 'stylesheet', '', report);
  if (data['stylesheet'] === undefined) {
    report('missing-property', 'The project file must name its "stylesheet".', 'stylesheet');
  }
  const settings: ProjectSettings = {
    ...(title !== undefined ? { title } : {}),
    stylesheet: stylesheet ?? '',
    defaults: readDefaults(data, report),
    fields: readFields(data, report),
  };

  // The meaning of the settings is only checked once they have been read without errors.
  const semantic = diagnostics.length === 0 ? validateProjectSettings(settings) : [];
  return { settings, diagnostics: [...diagnostics, ...semantic], formatVersion };
}
