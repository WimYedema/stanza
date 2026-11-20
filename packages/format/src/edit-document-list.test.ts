import { describe, expect, it } from 'vitest';
import { editDocumentList, type DocumentListChange } from './edit-document-list.js';
import { parseProject } from './project.js';

const PROJECT = "stanza-format: 1\nstylesheet: 'styles/default.yaml' # keep this\n";

function edited(source: string, change: DocumentListChange): string {
  const result = editDocumentList(source, change);
  if (!result.ok) throw new Error(result.message);
  expect(parseProject(result.text).diagnostics).toEqual([]);
  return result.text;
}

describe('document-list edits', () => {
  it('initializes without changing other settings, and refuses to replace an existing list', () => {
    const source = `${PROJECT}# project notes\ndefaults: { classification: 'Internal' }\n`;
    const change = { kind: 'initialize', paths: ['b.stanza.md', 'a.stanza.md'] } as const;
    const text = edited(source, change);
    expect(text).toBe(`${source}documents:\n  - b.stanza.md\n  - a.stanza.md\n`);
    expect(editDocumentList(text, change)).toMatchObject({ ok: false });
    expect(edited(PROJECT, { kind: 'initialize', paths: [] })).toContain('documents: []\n');
  });

  it('appends at the root and preserves nested groups, comments and settings after the list', () => {
    const source = `${PROJECT}documents: # outline
  # group explanation
  - group: First
    items:
      - 'a.stanza.md' # document explanation
# keep defaults
defaults: { classification: 'Internal' }
`;
    const change = { kind: 'append', path: 'b.stanza.md' } as const;
    const one = edited(source, change);
    const two = edited(source, change);
    expect(one).toBe(two);
    expect(one.startsWith(PROJECT)).toBe(true);
    expect(one.endsWith("# keep defaults\ndefaults: { classification: 'Internal' }\n")).toBe(true);
    expect(one).toContain('# outline');
    expect(one).toContain('# group explanation');
    expect(one).toContain("'a.stanza.md' # document explanation");
    expect(parseProject(one).settings.documents).toEqual([
      { kind: 'group', title: 'First', items: [{ kind: 'document', path: 'a.stanza.md' }] },
      { kind: 'document', path: 'b.stanza.md' },
    ]);
  });

  it('moves within a group and into a nested empty group without changing membership', () => {
    const source = `${PROJECT}documents:
  - group: First
    items:
      - a.stanza.md # follows A
      - b.stanza.md
  - group: Second
    items:
      - group: Nested
`;
    const moved = edited(source, { kind: 'move', path: 'a.stanza.md', direction: 'down' });
    expect(moved.indexOf('b.stanza.md')).toBeLessThan(moved.indexOf('a.stanza.md'));
    const grouped = edited(moved, { kind: 'regroup', path: 'a.stanza.md', group: [1, 0] });
    expect(grouped).toContain('a.stanza.md # follows A');
    expect(parseProject(grouped).settings.documents?.[1]).toEqual({
      kind: 'group',
      title: 'Second',
      items: [
        { kind: 'group', title: 'Nested', items: [{ kind: 'document', path: 'a.stanza.md' }] },
      ],
    });
    const back = edited(grouped, { kind: 'regroup', path: 'a.stanza.md', group: [] });
    expect(parseProject(back).settings.documents?.at(-1)).toEqual({
      kind: 'document',
      path: 'a.stanza.md',
    });
  });

  it('removes only the requested nested entry, retaining its notes and the empty group', () => {
    const source = `${PROJECT}documents:\n  - group: First\n    items:\n      - gone.stanza.md # investigate\n`;
    const text = edited(source, { kind: 'remove', path: 'gone.stanza.md' });
    expect(text).not.toContain('gone.stanza.md');
    expect(text).toContain('# investigate');
    expect(parseProject(text).settings.documents).toEqual([
      { kind: 'group', title: 'First', items: [] },
    ]);
  });

  it('supports flow lists and CRLF without rewriting surrounding text', () => {
    const source = `${PROJECT}documents: [a.stanza.md]\n# end\n`.replaceAll('\n', '\r\n');
    const text = edited(source, { kind: 'append', path: 'b.stanza.md' });
    expect(text).toBe(source.replace('[a.stanza.md]', '[a.stanza.md, b.stanza.md]'));
  });

  it('refuses invalid, duplicate, stale and unsupported edits explicitly', () => {
    for (const [source, change] of [
      ['bad: [', { kind: 'initialize', paths: [] }],
      [PROJECT, { kind: 'append', path: 'a.stanza.md' }],
      [`${PROJECT}documents: [a.stanza.md]\n`, { kind: 'append', path: 'a.stanza.md' }],
      [`${PROJECT}documents: [a.stanza.md]\n`, { kind: 'append', path: '../escape.stanza.md' }],
      [`${PROJECT}documents: [a.stanza.md]\n`, { kind: 'remove', path: 'gone.stanza.md' }],
      [
        `${PROJECT}documents: [a.stanza.md]\n`,
        { kind: 'move', path: 'a.stanza.md', direction: 'up' },
      ],
      [
        `${PROJECT}documents: [a.stanza.md]\n`,
        { kind: 'regroup', path: 'a.stanza.md', group: [0] },
      ],
      [`${PROJECT}documents: &shared [a.stanza.md]\n`, { kind: 'append', path: 'b.stanza.md' }],
    ] satisfies [string, DocumentListChange][]) {
      expect(editDocumentList(source, change)).toMatchObject({ ok: false });
    }
  });
});
