import { describe, expect, it } from 'vitest';
import type { DocumentMeta } from './document.js';
import {
  applyDefaults,
  outlinePaths,
  validateMetadata,
  validateProjectSettings,
  type FieldDeclaration,
  type OutlineEntry,
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
  it('distinguishes an absent property named constructor from its explicit value', () => {
    const project = settings({ constructor: string(true) });
    expect(problems({ fields: {} }, project)).toEqual([['error', 'missing-field', 'constructor']]);
    expect(problems({ fields: { constructor: '0012' } }, project)).toEqual([]);
  });
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

describe('the outline of the documents', () => {
  const doc = (path: string): OutlineEntry => ({ kind: 'document', path });
  const group = (title: string, ...items: OutlineEntry[]): OutlineEntry => ({
    kind: 'group',
    title,
    items,
  });
  const problems = (documents: readonly OutlineEntry[]) =>
    validateProjectSettings(settings(undefined, { documents })).map((d) => [d.code, d.path]);

  it('lists the paths in order, down through the groups', () => {
    expect(
      outlinePaths([
        doc('a.phrase.md'),
        group('G', doc('b.phrase.md'), group('H', doc('c.phrase.md'))),
        doc('d.phrase.md'),
      ]),
    ).toEqual(['a.phrase.md', 'b.phrase.md', 'c.phrase.md', 'd.phrase.md']);
    expect(outlinePaths([])).toEqual([]);
  });

  it('accepts safe paths, in groups too, and no outline at all', () => {
    expect(problems([doc('documents/a.phrase.md'), group('G', doc('b.phrase.md'))])).toEqual([]);
    expect(validateProjectSettings(settings())).toEqual([]);
  });

  it('rejects a path that is not a safe relative one', () => {
    expect(problems([group('G', doc('../a.phrase.md')), doc('/b.phrase.md')])).toEqual([
      ['invalid-path', 'documents'],
      ['invalid-path', 'documents'],
    ]);
  });

  it('rejects a document listed twice, also in another group', () => {
    expect(problems([doc('a.phrase.md'), group('G', doc('a.phrase.md'))])).toEqual([
      ['duplicate-document', 'documents'],
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
