import { describe, expect, it } from 'vitest';
import type { DocumentMeta } from './document.js';
import {
  applyDefaults,
  validateMetadata,
  validateProjectSettings,
  type FieldDeclaration,
  type ProjectSettings,
} from './project.js';

function settings(
  fields?: Record<string, FieldDeclaration>,
  extra: Partial<ProjectSettings> = {},
): ProjectSettings {
  return {
    stylesheet: 'styles/default.yaml',
    defaults: {},
    fields: fields === undefined ? undefined : new Map(Object.entries(fields)),
    ...extra,
  };
}

const string = (required = false): FieldDeclaration => ({ type: 'string', required });
const list = (required = false): FieldDeclaration => ({ type: 'list', required });

const problems = (meta: DocumentMeta, project: ProjectSettings) =>
  validateMetadata(meta, project).map((d) => [d.severity, d.code, d.path]);

describe('applyDefaults', () => {
  const project = settings(undefined, {
    defaults: { classification: 'restricted', authors: ['Team'] },
  });

  it('fills in what the document does not set', () => {
    expect(applyDefaults(project, { title: 'T', fields: { x: 'y' } })).toEqual({
      title: 'T',
      classification: 'restricted',
      authors: ['Team'],
      fields: { x: 'y' },
    });
  });

  it('lets the document override the defaults', () => {
    expect(
      applyDefaults(project, { classification: 'public', authors: ['Me'], fields: {} }),
    ).toEqual({ classification: 'public', authors: ['Me'], fields: {} });
  });

  it('adds nothing when the project has no defaults', () => {
    expect(applyDefaults(settings(), { fields: {} })).toEqual({ fields: {} });
  });
});

describe('validateMetadata', () => {
  it('accepts any field when the project declares nothing', () => {
    expect(problems({ fields: { anything: 'x', other: ['y'] } }, settings())).toEqual([]);
  });

  it('accepts matching fields', () => {
    const project = settings({ 'doc-no': string(true), distribution: list(), note: string() });
    expect(problems({ fields: { 'doc-no': 'P-1', distribution: ['a', 'b'] } }, project)).toEqual(
      [],
    );
  });

  it('requires required fields to be present and not empty', () => {
    const project = settings({ 'doc-no': string(true), distribution: list(true) });
    expect(problems({ fields: { distribution: [] } }, project)).toEqual([
      ['error', 'missing-field', 'doc-no'],
      ['error', 'missing-field', 'distribution'],
    ]);
    expect(problems({ fields: { 'doc-no': '', distribution: ['x'] } }, project)).toEqual([
      ['error', 'missing-field', 'doc-no'],
    ]);
  });

  it('reports a value of the wrong type', () => {
    const project = settings({ 'doc-no': string(), distribution: list() });
    expect(problems({ fields: { 'doc-no': ['x'], distribution: 'x' } }, project)).toEqual([
      ['error', 'field-type-mismatch', 'doc-no'],
      ['error', 'field-type-mismatch', 'distribution'],
    ]);
  });

  it('warns about undeclared fields when the project declares some', () => {
    expect(problems({ fields: { 'doc-nr': 'P-1' } }, settings({ 'doc-no': string() }))).toEqual([
      ['warning', 'undeclared-field', 'doc-nr'],
    ]);
  });

  it('treats an empty declaration as declaring no fields at all', () => {
    expect(problems({ fields: { x: 'y' } }, settings({}))).toEqual([
      ['warning', 'undeclared-field', 'x'],
    ]);
  });
});

describe('validateProjectSettings', () => {
  const codes = (project: ProjectSettings) => validateProjectSettings(project).map((d) => d.code);

  it('accepts a relative stylesheet path', () => {
    expect(codes(settings())).toEqual([]);
    expect(codes(settings(undefined, { stylesheet: 'default.yaml' }))).toEqual([]);
  });

  it.each([
    '',
    '/etc/styles.yaml',
    'C:/styles.yaml',
    '..\\styles.yaml',
    'a\\b.yaml',
    '../x.yaml',
    'a/../b.yaml',
    'a//b.yaml',
    'a/',
  ])('rejects the path "%s"', (path) => {
    expect(codes(settings(undefined, { stylesheet: path }))).toEqual(['invalid-path']);
  });

  it('rejects declared fields with built-in names', () => {
    const project = settings({ title: string(), 'doc-no': string(), authors: list() });
    expect(validateProjectSettings(project).map((d) => d.path)).toEqual([
      'metadata-fields.title',
      'metadata-fields.authors',
    ]);
  });
});
