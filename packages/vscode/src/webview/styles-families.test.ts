import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStylesheet } from '@stanza/format';
import {
  describeEntry,
  displayName,
  entriesOf,
  type Entry,
  type Family,
} from './styles-families.js';

const SOURCE = readFileSync(
  new URL('../../../../fixtures/example-project/styles/default.yaml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');

const stylesheet = parseStylesheet(SOURCE).stylesheet;
const entries = entriesOf(stylesheet);
const names = (family: Family): string[] =>
  entries.filter((entry) => entry.family === family).map((entry) => entry.name);
const entry = (kind: Entry['kind'], name: string): Entry => {
  const found = entries.find((candidate) => candidate.kind === kind && candidate.name === name);
  if (found === undefined) throw new Error(`No ${kind} ${name}.`);
  return found;
};

describe('entriesOf', () => {
  it('sorts the paragraph styles into headings, lists and the rest, in the order of the file', () => {
    expect(names('headings')).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'heading-4',
      'heading-5',
      'heading-6',
    ]);
    expect(names('lists')).toEqual(['list-bulleted', 'list-numbered']);
    expect(names('paragraphs')).toEqual([
      'body',
      'code',
      'table-cell',
      'header-footer',
      'toc-1',
      'toc-2',
      'toc-3',
      'cover-title',
      'cover-meta',
    ]);
  });

  it('lists the other families as the file declares them', () => {
    expect(names('tables')).toEqual(['table', 'table-grid']);
    expect(names('characters')).toEqual(['marker', 'muted']);
    expect(names('pages')).toEqual(['page', 'page-letter']);
    expect(names('theme')).toEqual([
      'brand',
      'heading',
      'muted',
      'rule',
      'surface',
      'white',
      'body',
      'mono',
    ]);
  });

  it('gives the base style of a style, and its label', () => {
    expect(entry('paragraph-style', 'heading-2').basedOn).toBe('heading-1');
    expect(entry('paragraph-style', 'body').basedOn).toBeUndefined();
    const labelled = parseStylesheet(
      SOURCE.replace(
        '  cover-meta:\n    based-on: body',
        "  cover-meta:\n    label: 'Cover details'\n    based-on: body",
      ),
    ).stylesheet;
    const found = entriesOf(labelled).find((candidate) => candidate.name === 'cover-meta');
    expect(found?.label).toBe('Cover details');
    expect(found && displayName(found)).toBe('Cover details');
    expect(displayName(entry('paragraph-style', 'body'))).toBe('body');
  });
});

describe('describeEntry', () => {
  it('says what a style is based on', () => {
    expect(describeEntry(entry('paragraph-style', 'heading-2'), stylesheet)).toEqual([
      ['Name', 'heading-2'],
      ['Based on', 'heading-1'],
    ]);
    expect(describeEntry(entry('table-style', 'table'), stylesheet)).toContainEqual([
      'Based on',
      'nothing',
    ]);
  });

  it('gives the page of a template, and the value of a token', () => {
    expect(describeEntry(entry('page-template', 'page-letter'), stylesheet)).toEqual([
      ['Name', 'page-letter'],
      ['Size', 'Letter'],
      ['Margins', '54, 90, 54, 90 pt'],
      ['Header', 'yes'],
      ['Footer', 'yes'],
      ['Cover', 'yes'],
    ]);
    expect(describeEntry(entry('color', 'brand'), stylesheet)).toContainEqual(['Value', '#2E75B6']);
    expect(describeEntry(entry('font', 'mono'), stylesheet)).toContainEqual([
      'Families',
      'Consolas, Courier New',
    ]);
  });
});
