import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readReview } from '@stanza/import-docx';
import { DEFAULT_BUILD_DATE } from './build.js';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';
import { pullReview } from './review-pull.js';
import {
  newPushFileName,
  pushFileName,
  pushReview,
  removedCommentsNote,
  reviewRoundStatus,
  type PushResult,
} from './review-push.js';

const FIXTURES = new URL('../../import-docx/fixtures/review-round-trip/', import.meta.url);
const fixture = (name: string): Uint8Array => readFileSync(new URL(name, FIXTURES));
const SOURCE = readFileSync(new URL('0002-host-and-dependencies.stanza.md', FIXTURES), 'utf8');
const REVIEWED = 'documents/0002-host-and-dependencies.stanza.md';
const OTHER = 'documents/other.stanza.md';
/** Saved in Word for the web on 2026-11-21 16:09 UTC, with 7 comments; never pulled here. */
const REVIEWED_FILE = 'web-replies-resolved-reaction.docx';

function project(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'stanza.yaml': "stanza-format: 1\ntitle: 'Push'\nstylesheet: 'styles/default.yaml'\n",
    'styles/default.yaml': readFileSync(
      new URL('../../../docs/styles/default.yaml', import.meta.url),
      'utf8',
    ),
    [REVIEWED]: SOURCE,
    [OTHER]:
      '---\nstanza-format: 1\ntitle: "Other"\n---\n\n<!-- stanza: #p3n8w2r5tq -->\n# Other\n',
    ...extra,
  };
}

async function push(
  files: Record<string, string>,
  document: string,
  existing?: Uint8Array,
  force = false,
): Promise<PushResult> {
  const storage = memoryStorage(files);
  const loaded = await loadProject(storage);
  return pushReview(
    storage,
    loaded,
    document,
    existing === undefined ? undefined : { name: 'review/file.docx', bytes: existing },
    { timestamp: DEFAULT_BUILD_DATE, ...(force ? { force } : {}) },
  );
}

const reasonOf = (result: PushResult): string => (result.ok ? 'ok' : result.reason);

describe('pushReview (ADR 0088)', () => {
  it('builds the document as a build does, stamped, with the same time as created and modified', async () => {
    const result = await push(project(), REVIEWED);
    if (!result.ok) throw new Error(result.message);
    expect(result.replaces).toBe(false);
    const read = readReview(result.bytes);
    if (!read.ok) throw new Error(read.message);
    expect(read.review.stamp?.document).toBe(REVIEWED);
    expect(read.review.createdAt).toBe(read.review.savedAt);
  });

  it('replaces a file that was pushed and not saved since', async () => {
    const first = await push(project(), REVIEWED);
    if (!first.ok) throw new Error(first.message);
    expect(await push(project(), REVIEWED, first.bytes)).toMatchObject({
      ok: true,
      replaces: true,
    });
  });

  it('refuses a file that was saved in Word and not pulled, and replaces it once it is', async () => {
    const refused = await push(project(), REVIEWED, fixture(REVIEWED_FILE));
    expect(refused).toMatchObject({ ok: false, reason: 'unpulled' });
    if (!refused.ok) {
      expect(refused.message).toBe(
        'review/file.docx was saved in Word on 2026-11-21 16:09 UTC, after it was pushed, and that version has not been pulled. It has 7 comments. Pull it first (stanza review pull), or push with --force to replace it.',
      );
    }
    let counter = 0;
    const storage = memoryStorage(project());
    const pulled = await pullReview(storage, fixture(REVIEWED_FILE), {
      fileName: REVIEWED_FILE,
      randomBytes: () => Uint8Array.from({ length: 10 }, (_v, i) => (counter++ * 7 + i * 13) % 256),
    });
    if (!pulled.ok) throw new Error(pulled.message);
    const withReview = project({ [pulled.document]: storage.texts.get(pulled.document) ?? '' });
    const replaced = await push(withReview, REVIEWED, fixture(REVIEWED_FILE));
    expect(reasonOf(replaced)).toBe('ok');
    // The comments leave the file, and the push says so: 7 comments, 3 threads still open.
    if (!replaced.ok) throw new Error(replaced.message);
    expect(replaced.removes).toEqual({ comments: 7, openThreads: 3 });
    expect(removedCommentsNote('review/file.docx', replaced.removes)).toBe(
      'review/file.docx had 7 comments. The new file is a clean copy of the document, so they are no longer in it; they stay in the review documents, where 3 threads are still open.',
    );
    expect(removedCommentsNote('a.docx', { comments: 0, openThreads: 2 })).toBeUndefined();
    expect(removedCommentsNote('a.docx', { comments: 1, openThreads: 0 })).toContain(
      'had 1 comment.',
    );
    // A pull of an earlier save does not count for a later one.
    const older =
      withReview[pulled.document]?.replace(
        'last saved 2026-11-21 16:09 UTC',
        'last saved 2026-11-21 16:08 UTC',
      ) ?? '';
    expect(older).not.toBe(withReview[pulled.document]);
    expect(
      reasonOf(
        await push({ ...withReview, [pulled.document]: older }, REVIEWED, fixture(REVIEWED_FILE)),
      ),
    ).toBe('unpulled');
  });

  it('refuses a file of another document, of no document of the project, or no DOCX', async () => {
    expect(reasonOf(await push(project(), OTHER, fixture(REVIEWED_FILE)))).toBe('other-document');
    const stranger = zipSync({
      'word/document.xml': strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    expect(reasonOf(await push(project(), REVIEWED, stranger))).toBe('not-of-project');
    expect(reasonOf(await push(project(), REVIEWED, new Uint8Array([1, 2, 3])))).toBe(
      'not-a-document',
    );
  });

  it('replaces anything with force', async () => {
    expect(reasonOf(await push(project(), REVIEWED, fixture(REVIEWED_FILE), true))).toBe('ok');
    expect(reasonOf(await push(project(), REVIEWED, new Uint8Array([1, 2, 3]), true))).toBe('ok');
  });

  it('pushes nothing for a document with errors, or one that is not of the project', async () => {
    const broken = project({
      [OTHER]: '---\nstanza-format: 1\ntitle: "Other"\n---\n\n<!-- stanza: .missing -->\nText\n',
    });
    expect(reasonOf(await push(broken, OTHER))).toBe('blocked');
    expect(reasonOf(await push(project(), 'documents/nowhere.stanza.md'))).toBe('blocked');
  });

  it('names the file as a build does, or a new one by the day with a number when taken', () => {
    expect(pushFileName(REVIEWED)).toBe('0002-host-and-dependencies.docx');
    const taken = new Set(['a-2026-11-24.docx', 'a-2026-11-24-2.docx']);
    expect(newPushFileName('documents/a.stanza.md', '2026-11-24', (name) => taken.has(name))).toBe(
      'a-2026-11-24-3.docx',
    );
    expect(newPushFileName('documents/a.stanza.md', '2026-11-25', (name) => taken.has(name))).toBe(
      'a-2026-11-25.docx',
    );
  });
});

describe('reviewRoundStatus (ADR 0088)', () => {
  const status = async (files: Record<string, string>, existing?: Uint8Array, source = SOURCE) => {
    const loaded = await loadProject(memoryStorage(files));
    return reviewRoundStatus(
      loaded,
      REVIEWED,
      existing === undefined ? undefined : { name: 'review/file.docx', bytes: existing },
      source,
    );
  };

  it('tells a pushed file that is current from one whose document changed since', async () => {
    expect(await status(project())).toEqual({ kind: 'not-pushed' });
    const pushed = await push(project(), REVIEWED);
    if (!pushed.ok) throw new Error(pushed.message);
    expect(await status(project(), pushed.bytes)).toEqual({ kind: 'current' });
    expect(await status(project(), pushed.bytes, `${SOURCE}\nMore text.\n`)).toEqual({
      kind: 'changed',
    });
  });

  it('says how many comments came back that were not pulled, before anything else', async () => {
    expect(await status(project(), fixture(REVIEWED_FILE), 'changed')).toEqual({
      kind: 'unpulled',
      comments: 7,
      savedAt: '2026-11-21 16:09',
    });
    const other = await status(project(), new Uint8Array([1, 2, 3]));
    expect(other.kind).toBe('not-this-document');
  });
});
