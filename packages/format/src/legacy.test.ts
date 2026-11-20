import { describe, expect, it } from 'vitest';
import { migrateLegacyDocument, migrateLegacyYaml } from './legacy.js';
import { parseDocument } from './parse.js';
import { parseProject } from './project.js';
import { serializeDocument } from './serialize.js';
import { parseStylesheet } from './stylesheet.js';

const LEGACY_DOCUMENT = `---
phrase-format: 1
title: "Old"
---

<!-- phrase: #k7m2q9x4zb -->
# Heading

See [the other](other.phrase.md#a1b2c3d4e5) and [this](#k7m2q9x4zb).

<!-- phrase: .table -->
\`\`\`phrase-table
- - Cell with [a link](../x.phrase.md#a1b2c3d4e5 "title")
\`\`\`

\`\`\`phrase-toc
depth: 2
\`\`\`

An example: \`<!-- phrase: #k7m2q9x4zb -->\` and \`[x](y.phrase.md)\`.

\`\`\`text
<!-- phrase: #k7m2q9x4zb -->
phrase-format: 1
[x](y.phrase.md)
\`\`\`
`;

describe('migrateLegacyDocument', () => {
  it('rewrites the format key, annotations, semantic fences and document links', () => {
    const { text, changes } = migrateLegacyDocument(LEGACY_DOCUMENT);
    expect(text).toContain('stanza-format: 1\n');
    expect(text).toContain('<!-- stanza: #k7m2q9x4zb -->\n# Heading');
    expect(text).toContain('[the other](other.stanza.md#a1b2c3d4e5)');
    expect(text).toContain('[this](#k7m2q9x4zb)');
    expect(text).toContain('<!-- stanza: .table -->\n```stanza-table');
    expect(text).toContain('[a link](../x.stanza.md#a1b2c3d4e5 "title")');
    expect(text).toContain('```stanza-toc\ndepth: 2');
    expect(changes).toBe(7);
  });

  it('leaves inline code and ordinary code fences as they are', () => {
    const { text } = migrateLegacyDocument(LEGACY_DOCUMENT);
    expect(text).toContain('`<!-- phrase: #k7m2q9x4zb -->` and `[x](y.phrase.md)`');
    expect(text).toContain(
      '```text\n<!-- phrase: #k7m2q9x4zb -->\nphrase-format: 1\n[x](y.phrase.md)\n```',
    );
  });

  it('gives a canonical Stanza document that keeps its IDs', () => {
    const source =
      '---\nphrase-format: 1\ntitle: "Old"\n---\n\n<!-- phrase: #k7m2q9x4zb -->\n# Heading\n\nText.\n';
    const { text } = migrateLegacyDocument(source);
    const parsed = parseDocument(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.document.blocks[0]).toMatchObject({ type: 'heading', id: 'k7m2q9x4zb' });
    expect(serializeDocument(parsed.document)).toBe(text);
  });

  it('changes nothing in a Stanza document, so a second run is a no-op', () => {
    const once = migrateLegacyDocument(LEGACY_DOCUMENT).text;
    expect(migrateLegacyDocument(once)).toEqual({ text: once, changes: 0 });
  });
});

describe('migrateLegacyYaml', () => {
  it('rewrites the format key, token links and document paths, keeping comments', () => {
    const source = `# The project
phrase-format: 1
title: 'Old'
documents:
  - documents/a.phrase.md # first
footer:
  left: '[](phrase:title)'
  right: 'Page [1](phrase:page) of [1](phrase:pages)'
`;
    const { text, changes } = migrateLegacyYaml(source);
    expect(text).toBe(`# The project
stanza-format: 1
title: 'Old'
documents:
  - documents/a.stanza.md # first
footer:
  left: '[](stanza:title)'
  right: 'Page [1](stanza:page) of [1](stanza:pages)'
`);
    expect(changes).toBe(5);
  });
});

describe('legacy files', () => {
  it('reports a Phrase document with one actionable error', () => {
    const parsed = parseDocument('---\nphrase-format: 1\ntitle: "Old"\n---\n\nText.\n');
    expect(parsed.diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual([
      'error legacy-format',
    ]);
    expect(parsed.diagnostics[0]?.message).toContain('stanza migrate');
  });

  it('reports a Phrase project file and stylesheet without other diagnostics', () => {
    const project = parseProject(
      "phrase-format: 1\ntitle: 'Old'\nstylesheet: 'styles/default.yaml'\n",
    );
    expect(project.diagnostics.map((d) => d.code)).toEqual(['legacy-format']);
    const stylesheet = parseStylesheet('phrase-format: 1\nparagraph-styles: {}\n');
    expect(stylesheet.diagnostics.map((d) => d.code)).toEqual(['legacy-format']);
  });
});
