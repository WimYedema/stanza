import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse.js';
import { serializeDocument } from './serialize.js';

const directory = new URL('../../../fixtures/format/', import.meta.url);

// The working tree may use CRLF on Windows; Git stores these files with LF (see .gitattributes).
function read(name: string): string {
  return readFileSync(new URL(name, directory), 'utf8').replace(/\r\n/g, '\n');
}

const fixtures = readdirSync(directory).filter((name) => name.endsWith('.phrase.md'));

describe('fixtures', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('%s parses without diagnostics', (name) => {
    expect(parseDocument(read(name)).diagnostics).toEqual([]);
  });

  it.each(fixtures)('%s is in canonical form', (name) => {
    const text = read(name);
    expect(serializeDocument(parseDocument(text).document)).toBe(text);
  });

  it.each(fixtures)('%s serializes the same way twice', (name) => {
    const { document } = parseDocument(read(name));
    expect(serializeDocument(parseDocument(serializeDocument(document)).document)).toBe(
      serializeDocument(document),
    );
  });
});
