import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject } from './project.js';

const fixture = readFileSync(
  new URL('../../../fixtures/example-project/phrase.yaml', import.meta.url),
  'utf8',
);

const codes = (source: string): (string | undefined)[] =>
  parseProject(source).diagnostics.map((d) => `${d.code}@${d.path ?? ''}`);

describe('parseProject', () => {
  it('reads the fixture without diagnostics', () => {
    const result = parseProject(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.formatVersion).toBe(1);
    expect(result.settings.title).toBe('Example project');
    expect(result.settings.stylesheet).toBe('styles/default.yaml');
    expect(result.settings.defaults).toEqual({
      classification: 'Internal',
      authors: ['Example Author'],
    });
    expect([...(result.settings.fields ?? [])]).toEqual([
      ['document-number', { type: 'string', required: true, label: 'Document number' }],
      ['reviewers', { type: 'list', required: false }],
    ]);
  });

  it('accepts a minimal project and leaves fields undeclared', () => {
    const result = parseProject('phrase-format: 1\nstylesheet: s.yaml\n');
    expect(result.diagnostics).toEqual([]);
    expect(result.settings.fields).toBeUndefined();
    expect(result.settings.defaults).toEqual({});
  });

  it('treats an empty metadata-fields mapping as declaring nothing allowed', () => {
    const result = parseProject('phrase-format: 1\nstylesheet: s.yaml\nmetadata-fields: {}\n');
    expect(result.settings.fields?.size).toBe(0);
  });

  it('handles a BOM and CRLF line endings', () => {
    const source = `\uFEFF${fixture.replace(/\r?\n/g, '\r\n')}`;
    expect(parseProject(source).diagnostics).toEqual([]);
  });

  it('reports invalid YAML', () => {
    expect(codes('phrase-format: [1\n')).toEqual(['invalid-yaml@']);
  });

  it('reports a missing or unsupported format version', () => {
    expect(codes('stylesheet: s.yaml\n')).toEqual(['format-version-missing@phrase-format']);
    expect(codes('phrase-format: 2\nstylesheet: s.yaml\n')).toEqual([
      'format-version-unsupported@phrase-format',
    ]);
  });

  it('reports a missing stylesheet and unknown properties', () => {
    expect(codes('phrase-format: 1\nbogus: 1\n')).toEqual([
      'unknown-property@bogus',
      'missing-property@stylesheet',
    ]);
  });

  it('reports wrongly typed values', () => {
    expect(
      codes(
        'phrase-format: 1\ntitle: 3\nstylesheet: s.yaml\ndefaults:\n  authors: x\n  classification: 4\n',
      ),
    ).toEqual([
      'invalid-type@title',
      'invalid-type@defaults.classification',
      'invalid-type@defaults.authors',
    ]);
  });

  it('reports bad field declarations', () => {
    const source =
      'phrase-format: 1\nstylesheet: s.yaml\nmetadata-fields:\n' +
      '  Bad_Name:\n    type: string\n' +
      '  kind:\n    type: number\n' +
      '  flag:\n    type: string\n    required: yes please\n' +
      '  extra:\n    type: string\n    colour: red\n';
    expect(codes(source)).toEqual([
      'invalid-value@metadata-fields.Bad_Name',
      'invalid-value@metadata-fields.kind.type',
      'invalid-type@metadata-fields.flag.required',
      'unknown-property@metadata-fields.extra.colour',
    ]);
  });

  it('checks the meaning of the settings once they are read cleanly', () => {
    expect(codes('phrase-format: 1\nstylesheet: ../s.yaml\n')).toEqual(['invalid-path@stylesheet']);
    expect(
      codes('phrase-format: 1\nstylesheet: s.yaml\nmetadata-fields:\n  title:\n    type: string\n'),
    ).toEqual(['reserved-field-name@metadata-fields.title']);
  });
});
