import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject } from './project.js';

const fixture = readFileSync(
  new URL('../../../fixtures/example-project/stanza.yaml', import.meta.url),
  'utf8',
);

const codes = (source: string): (string | undefined)[] =>
  parseProject(source).diagnostics.map((d) => `${d.code}@${d.path ?? ''}`);

describe('parseProject', () => {
  it('reads link templates without changing the existing format version', () => {
    const result = parseProject(
      'stanza-format: 1\nstylesheet: s.yaml\nlink-schemes:\n  jira: https://example.org/browse/{id}\n',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.formatVersion).toBe(1);
    expect(result.settings.linkSchemes).toEqual({ jira: 'https://example.org/browse/{id}' });
    expect(codes('stanza-format: 1\nstylesheet: s.yaml\nlink-schemes:\n  jira: 42\n')).toEqual([
      'invalid-type@link-schemes.jira',
    ]);
    expect(
      codes(
        'stanza-format: 1\nstylesheet: s.yaml\nlink-schemes:\n  https: https://example.org/{id}\n',
      ),
    ).toEqual(['invalid-link-scheme@link-schemes.https']);
  });

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
    const result = parseProject('stanza-format: 1\nstylesheet: s.yaml\n');
    expect(result.diagnostics).toEqual([]);
    expect(result.settings.fields).toBeUndefined();
    expect(result.settings.defaults).toEqual({});
  });

  it('reads the default page template', () => {
    const result = parseProject(
      'stanza-format: 1\nstylesheet: s.yaml\ndefaults:\n  page-template: page-letter\n',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.settings.defaults).toEqual({ pageTemplate: 'page-letter' });
    expect(codes('stanza-format: 1\nstylesheet: s.yaml\ndefaults:\n  page-template: 3\n')).toEqual([
      'invalid-type@defaults.page-template',
    ]);
  });

  it('treats an empty metadata-fields mapping as declaring nothing allowed', () => {
    const result = parseProject('stanza-format: 1\nstylesheet: s.yaml\nmetadata-fields: {}\n');
    expect(result.settings.fields?.size).toBe(0);
  });

  it('handles a BOM and CRLF line endings', () => {
    const source = `\uFEFF${fixture.replace(/\r?\n/g, '\r\n')}`;
    expect(parseProject(source).diagnostics).toEqual([]);
  });

  it('reports invalid YAML', () => {
    expect(codes('stanza-format: [1\n')).toEqual(['invalid-yaml@']);
  });

  it('reports a missing or unsupported format version', () => {
    expect(codes('stylesheet: s.yaml\n')).toEqual(['format-version-missing@stanza-format']);
    expect(codes('stanza-format: 2\nstylesheet: s.yaml\n')).toEqual([
      'format-version-unsupported@stanza-format',
    ]);
  });

  it('reports a missing stylesheet and unknown properties', () => {
    expect(codes('stanza-format: 1\nbogus: 1\n')).toEqual([
      'unknown-property@bogus',
      'missing-property@stylesheet',
    ]);
  });

  it('reports wrongly typed values', () => {
    expect(
      codes(
        'stanza-format: 1\ntitle: 3\nstylesheet: s.yaml\ndefaults:\n  authors: x\n  classification: 4\n',
      ),
    ).toEqual([
      'invalid-type@title',
      'invalid-type@defaults.classification',
      'invalid-type@defaults.authors',
    ]);
  });

  it('reports bad field declarations', () => {
    const source =
      'stanza-format: 1\nstylesheet: s.yaml\nmetadata-fields:\n' +
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
    expect(codes('stanza-format: 1\nstylesheet: ../s.yaml\n')).toEqual(['invalid-path@stylesheet']);
    expect(
      codes('stanza-format: 1\nstylesheet: s.yaml\nmetadata-fields:\n  title:\n    type: string\n'),
    ).toEqual(['reserved-field-name@metadata-fields.title']);
  });
});

describe('the documents of a project', () => {
  const head = 'stanza-format: 1\nstylesheet: s.yaml\n';

  it('leaves the outline absent when the file does not declare one', () => {
    expect(parseProject(head).settings.documents).toBeUndefined();
  });

  it('reads paths and groups, down through the groups, in order', () => {
    const result = parseProject(
      `${head}documents:\n  - intro.stanza.md\n  - group: Reference\n    items:\n      - a.stanza.md\n      - group: Deeper\n        items:\n          - b.stanza.md\n  - last.stanza.md\n`,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.settings.documents).toEqual([
      { kind: 'document', path: 'intro.stanza.md' },
      {
        kind: 'group',
        title: 'Reference',
        items: [
          { kind: 'document', path: 'a.stanza.md' },
          {
            kind: 'group',
            title: 'Deeper',
            items: [{ kind: 'document', path: 'b.stanza.md' }],
          },
        ],
      },
      { kind: 'document', path: 'last.stanza.md' },
    ]);
  });

  it('accepts an empty list and a group without items', () => {
    expect(parseProject(`${head}documents: []\n`).settings.documents).toEqual([]);
    expect(parseProject(`${head}documents:\n  - group: Later\n`).settings.documents).toEqual([
      { kind: 'group', title: 'Later', items: [] },
    ]);
  });

  it('reports what is not a list, a path or a group', () => {
    expect(codes(`${head}documents: a.stanza.md\n`)).toEqual(['invalid-type@documents']);
    expect(codes(`${head}documents:\n  - 3\n  - [x]\n`)).toEqual([
      'invalid-type@documents[0]',
      'invalid-type@documents[1]',
    ]);
    expect(codes(`${head}documents:\n  - items: []\n`)).toEqual(['missing-property@documents[0]']);
    expect(codes(`${head}documents:\n  - group: ''\n    colour: red\n`)).toEqual([
      'unknown-property@documents[0].colour',
      'invalid-value@documents[0].group',
    ]);
    expect(codes(`${head}documents:\n  - group: G\n    items: a\n`)).toEqual([
      'invalid-type@documents[0].items',
    ]);
  });

  it('checks the paths and the repeats once the file is read cleanly', () => {
    expect(codes(`${head}documents:\n  - ../a.stanza.md\n`)).toEqual(['invalid-path@documents']);
    expect(codes(`${head}documents:\n  - a.stanza.md\n  - a.stanza.md\n`)).toEqual([
      'duplicate-document@documents',
    ]);
  });
});
