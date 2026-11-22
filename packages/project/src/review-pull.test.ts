import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { NodeId } from '@stanza/core';
import { parseDocument } from '@stanza/format';
import type { DocxParagraph } from '@stanza/import-docx';
import { buildProject } from './build.js';
import { loadProject } from './load.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';
import {
  cellAt,
  editsBetween,
  pullReview,
  quoteText,
  type PullReviewResult,
} from './review-pull.js';

const FIXTURES = new URL('../../import-docx/fixtures/review-round-trip/', import.meta.url);
const fixture = (name: string): Uint8Array => readFileSync(new URL(name, FIXTURES));
const SOURCE = readFileSync(new URL('0002-host-and-dependencies.stanza.md', FIXTURES), 'utf8');
const REVIEWED = 'documents/0002-host-and-dependencies.stanza.md';

/** A project with the document the fixtures were made from, and the stylesheet of these docs. */
function project(): Record<string, string> {
  return {
    'stanza.yaml': "stanza-format: 1\ntitle: 'Review test'\nstylesheet: 'styles/default.yaml'\n",
    'styles/default.yaml': readFileSync(
      new URL('../../../docs/styles/default.yaml', import.meta.url),
      'utf8',
    ),
    [REVIEWED]: SOURCE,
  };
}

let counter = 0;
const options = (fileName: string) => ({
  fileName,
  // Fresh bytes for every ID, so that the new IDs are unique and repeatable.
  randomBytes: () => Uint8Array.from({ length: 10 }, (_v, i) => (counter++ * 7 + i * 13) % 256),
});

async function pull(name: string, bytes = fixture(name), files = project()) {
  const storage = memoryStorage(files);
  const result = await pullReview(storage, bytes, options(name));
  if (!result.ok) throw new Error(result.message);
  return { storage, result, text: storage.texts.get(result.document) ?? '' };
}

const okOf = (result: PullReviewResult) => {
  if (!result.ok) throw new Error(result.message);
  return result;
};

describe('pullReview (ADR 0084)', () => {
  it('writes a review document, one heading per thread, linked to the blocks', async () => {
    const { result, text } = await pull('web-replies-resolved-reaction.docx');
    expect(result.document).toBe('reviews/0002-host-and-dependencies-2026-11-21.stanza.md');
    expect(result.reviewed).toBe(REVIEWED);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(text).toContain(`reviews: "${REVIEWED}"`);
    expect(text).toContain('# Review of ADR 0002: Host environment and dependency policy');
    expect(text).toContain('7 comments in 5 threads: 3 open, 2 resolved, 0 not placed.');
    expect(text).toContain('Edits not checked: the file has no revision stamp.');
    // The places, as the file shows them.
    expect(text).toContain(
      'In the 4th paragraph under [Host](../documents/0002-host-and-dependencies.stanza.md#vkpazyqv7x), at "host".',
    );
    expect(text).toContain(
      'In [the table](../documents/0002-host-and-dependencies.stanza.md#x6gmjy7p23) under Packages, row 2, column 2, at "Domain".',
    );
    expect(text).toContain('In the 1st paragraph after [the table]');
    // A thread: status, the comment, its reactions and its reply.
    expect(text).toContain('Status: resolved. Word comment 21AB04C2.');
    expect(text).toContain('**Ada Reviewer, 2026-11-21 15:25 UTC:** Comment in heading');
    expect(text).toContain('Reactions: thumbs up (Ada Reviewer).');
    expect(text).toContain('**Ada Reviewer, 2026-11-21 16:08 UTC:** Replying');
    // Display names only.
    expect(text).not.toContain('example.com');
    expect(text).not.toContain('0000000000000000');
  });

  it('keeps the review document out of the build and the list warnings', async () => {
    const pulled = await pull('desktop-protected.docx');
    const { result } = pulled;
    // The test storage does not read back what it wrote, so the project is opened again with it.
    const storage = memoryStorage({ ...project(), [result.document]: pulled.text });
    const loaded = await loadProject(storage);
    const entry = loaded.documents.find((d) => d.path === result.document);
    expect(entry?.listed).toBe(false);
    expect(loaded.diagnostics.filter((d) => d.file === result.document)).toEqual([]);
    const built = await buildProject(storage, {
      outDir: 'build',
      timestamp: new Date('2026-01-01'),
    });
    expect(built.written).toEqual(['build/documents/0002-host-and-dependencies.docx']);
  });

  it('checks for edits against the embedded source, and finds none in an unchanged review', async () => {
    const { text } = await pull('stamped-desktop-then-web.docx');
    expect(text).toContain('at revision 5f7f366. The document has not changed since.');
    expect(text).toContain(
      'Edits checked against the reviewed version (embedded in the file): none.',
    );
  });

  it('reports a change made without tracking and a tracked change, and applies neither', async () => {
    const files = unzipSync(fixture('stamped-desktop-then-web.docx'));
    let xml = strFromU8(files['word/document.xml'] ?? new Uint8Array());
    xml = xml.replace('Electron is not planned', 'Electron is definitely not planned');
    const run = [...xml.matchAll(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>).)*?<\/w:r>/gs)].find((m) =>
      m[0].includes('>Pandoc<'),
    );
    if (run?.index === undefined) throw new Error('The fixture has no Pandoc heading.');
    const deleted = run[0]
      .replace(/<w:t(\s[^>]*)?>/, '<w:delText$1>')
      .replace('</w:t>', '</w:delText>');
    xml = `${xml.slice(0, run.index)}<w:del w:id="901" w:author="Ada Reviewer">${deleted}</w:del>${xml.slice(run.index + run[0].length)}`;
    files['word/document.xml'] = strToU8(xml);
    const { storage, result, text } = await pull('edited.docx', zipSync(files));
    expect(result.lines).toContain('1 change to the text found in the file, not applied.');
    expect(result.lines).toContain('1 tracked change in the file, not applied.');
    expect(text).toContain('**Was:** Electron is not planned.');
    expect(text).toContain('**Is now:** Electron is definitely not planned.');
    expect(text).toContain('**Ada Reviewer:** deleted "Pandoc"');
    // The reviewed document is as it was.
    expect(await storage.readText(REVIEWED)).toBe(SOURCE);
  });

  it('takes the reviewed version from Git when it is not embedded, and checks its hash', async () => {
    // The same file without its embedded source: only the stamp is left.
    const files = Object.entries(unzipSync(fixture('stamped-desktop-then-web.docx')));
    const bytes = zipSync(Object.fromEntries(files.filter(([n]) => !n.startsWith('customXml/'))));
    const fromGit = async (answer: string | undefined) =>
      okOf(
        await pullReview(memoryStorage(project()), bytes, {
          ...options('stamped.docx'),
          sourceAt: () => Promise.resolve(answer),
        }),
      );
    const storage = memoryStorage(project());
    const found = await fromGit(SOURCE);
    expect(found.lines.join(' ')).not.toContain('Edits not checked');
    const wrong = await fromGit('other text');
    expect(wrong.lines).toContain(
      'Edits not checked: the source at its commit does not match the file.',
    );
    const missing = await fromGit(undefined);
    expect(missing.lines).toContain('Edits not checked: commit 5f7f366 is not in the repository.');
    expect(storage.written.size).toBe(0);
  });

  it('makes a new document on every pull, and says which threads were pulled before', async () => {
    const storage = memoryStorage(project());
    const first = okOf(
      await pullReview(storage, fixture('web-unprotected.docx'), options('a.docx')),
    );
    const files = { ...project(), [first.document]: storage.texts.get(first.document) ?? '' };
    const again = memoryStorage(files);
    const second = okOf(
      await pullReview(again, fixture('web-unprotected.docx'), options('a.docx')),
    );
    expect(second.document).toBe('reviews/0002-host-and-dependencies-2026-11-21-2.stanza.md');
    expect(second.lines).toContain(`5 of 5 threads are also in ${first.document}.`);
  });

  it('writes nothing for a file that is not a document of the project', async () => {
    const storage = memoryStorage(exampleProject());
    const result = await pullReview(storage, fixture('desktop-protected.docx'), options('x.docx'));
    expect(result).toMatchObject({ ok: false, reason: 'not-in-project' });
    expect(storage.texts.size).toBe(0);
  });
});

describe('a review document in the project', () => {
  it('is warned about when the document it reviews is not in the project', async () => {
    const files = {
      ...project(),
      'reviews/gone.stanza.md':
        '---\nstanza-format: 1\ntitle: "Review"\nreviews: "documents/gone.stanza.md"\n---\n\nText.\n',
    };
    const loaded = await loadProject(memoryStorage(files));
    const codes = loaded.diagnostics
      .filter((d) => d.file === 'reviews/gone.stanza.md')
      .map((d) => d.code);
    expect(codes).toEqual(['unknown-reviewed-document']);
  });
});

describe('quoteText', () => {
  it('keeps a short quote whole and a long one by both ends', () => {
    expect(quoteText('  a \n b ')).toBe('a b');
    const long = `${'a'.repeat(150)}${'b'.repeat(150)}`;
    expect(quoteText(long)).toBe(`${'a'.repeat(100)}…${'b'.repeat(100)}`);
  });
});

describe('cellAt', () => {
  it('counts cells from the header row, with a paragraph per plain cell', () => {
    const table = parseDocument(
      '---\nstanza-format: 1\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    ).document.blocks[0];
    if (table === undefined) throw new Error('no table');
    expect(cellAt(table, 0)).toEqual({ row: 1, column: 1 });
    expect(cellAt(table, 3)).toEqual({ row: 2, column: 2 });
    expect(cellAt(table, 4)).toBeUndefined();
  });
});

describe('editsBetween', () => {
  const p = (text: string, block?: string): DocxParagraph =>
    block === undefined ? { text } : { text, block: block as NodeId };
  it('groups each run of different paragraphs into one edit, with its block', () => {
    expect(
      editsBetween(
        [p('Title', 'aaaaaaaaaa'), p('One'), p('Two'), p('Three')],
        [p('Title', 'aaaaaaaaaa'), p('One'), p('Two, changed', 'aaaaaaaaaa'), p('Three')],
      ),
    ).toEqual([{ block: 'aaaaaaaaaa', before: 'Two', after: 'Two, changed' }]);
    expect(editsBetween([p('A'), p('B')], [p('A'), p('B')])).toEqual([]);
  });
});
