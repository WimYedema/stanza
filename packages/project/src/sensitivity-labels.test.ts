import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { validateMetadata } from '@stanza/core';
import { parseProject } from '@stanza/format';
import { readReview } from '@stanza/import-docx';
import { loadProject } from './load.js';
import { memoryStorage } from './memory-storage.testing.js';
import { pullReview } from './review-pull.js';
import { compareLabel, labelLine, recordSensitivityLabelFromFile } from './sensitivity-labels.js';

/** Made-up GUIDs: the files of a real tenant stay out of the repository (ADR 0087). */
const TENANT = '9a2c1f0e-4b7d-4c3a-8e21-5f6b7c8d9e0a';
const OTHER_TENANT = '0f1e2d3c-4b5a-4968-8776-655443322110';
const CONFIDENTIAL = '1b3d5f7a-2c4e-4a6b-8d0f-1a2b3c4d5e6f';
const GENERAL = '7e9f0a1b-3c5d-4e7f-9a1b-2c3d4e5f6a7b';

const FIXTURES = new URL('../../import-docx/fixtures/review-round-trip/', import.meta.url);
/** Stamped: built from `documents/0002-host-and-dependencies.stanza.md` (ADR 0084). */
const STAMPED = readFileSync(new URL('stamped-desktop-then-web.docx', FIXTURES));
const SOURCE = readFileSync(new URL('0002-host-and-dependencies.stanza.md', FIXTURES), 'utf8');
const REVIEWED = 'documents/0002-host-and-dependencies.stanza.md';

function project(extra = ''): Record<string, string> {
  return {
    'stanza.yaml': `stanza-format: 1\ntitle: 'Labels' # kept\nstylesheet: 'styles/default.yaml'\ndefaults:\n  classification: Confidential\n${extra}`,
    'styles/default.yaml': readFileSync(
      new URL('../../../docs/styles/default.yaml', import.meta.url),
      'utf8',
    ),
    [REVIEWED]: SOURCE,
  };
}

/** The file with the label of a tenant added to its custom properties, as Word writes it. */
function labelled(bytes: Uint8Array, id: string, tenant: string, name?: string): Uint8Array {
  const files = unzipSync(bytes);
  // Office would add the part with its relationship; the reader finds it by its usual path too.
  const custom =
    files['docProps/custom.xml'] === undefined
      ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>'
      : strFromU8(files['docProps/custom.xml']);
  const fields: Record<string, string> = {
    Enabled: 'true',
    SetDate: '2026-11-24T10:00:00Z',
    Method: 'Standard',
    SiteId: tenant,
    ActionId: '00000000-0000-0000-0000-000000000001',
    ContentBits: '0',
    ...(name !== undefined ? { Name: name } : {}),
  };
  const properties = Object.entries(fields)
    .map(
      ([field, value], index) =>
        `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${String(100 + index)}" name="MSIP_Label_${id}_${field}"><vt:lpwstr>${value}</vt:lpwstr></property>`,
    )
    .join('');
  // The part ends with `</Properties>`, or is one empty element.
  const added = custom.includes('</Properties>')
    ? custom.replace('</Properties>', `${properties}</Properties>`)
    : custom.replace(/<Properties([^>]*)\/>/, `<Properties$1>${properties}</Properties>`);
  if (added === custom) throw new Error('The fixture has no custom properties part to add to.');
  files['docProps/custom.xml'] = strToU8(added);
  return zipSync(files);
}

const CONFIDENTIAL_FILE = labelled(STAMPED, CONFIDENTIAL, TENANT, 'Confidential');

/**
 * Records a label and gives the files after it: the storage of the tests keeps what is written
 * apart from what it reads.
 */
async function record(
  files: Record<string, string>,
  bytes: Uint8Array,
  options: Parameters<typeof recordSensitivityLabelFromFile>[2] = {},
) {
  const storage = memoryStorage(files);
  const result = await recordSensitivityLabelFromFile(storage, bytes, options);
  const written = storage.texts.get('stanza.yaml');
  return { result, files: written === undefined ? files : { ...files, 'stanza.yaml': written } };
}

describe('recordSensitivityLabelFromFile (ADR 0087)', () => {
  it('records the label for the classification of the stamped document, keeping the rest', async () => {
    const { result, files } = await record(project(), CONFIDENTIAL_FILE);
    expect(result).toEqual({
      ok: true,
      classification: 'Confidential',
      label: { id: CONFIDENTIAL, name: 'Confidential' },
      tenant: TENANT,
      changed: true,
    });
    const text = files['stanza.yaml'] ?? '';
    expect(text.startsWith(project()['stanza.yaml'] ?? '')).toBe(true);
    expect(parseProject(text).settings.sensitivityLabels).toEqual({
      tenant: TENANT,
      labels: { Confidential: { id: CONFIDENTIAL, name: 'Confidential' } },
    });
    // Recording it again changes nothing.
    const again = await record(files, CONFIDENTIAL_FILE);
    expect(again.result).toMatchObject({ ok: true, changed: false });
    expect(again.files['stanza.yaml']).toBe(text);
  });

  it('records for a classification that is given, also from a file of no document', async () => {
    const unstamped = labelled(
      readFileSync(new URL('web-unprotected.docx', FIXTURES)),
      GENERAL,
      TENANT,
      'General',
    );
    const { result, files } = await record(project(), unstamped, {
      classification: 'Company Internal',
    });
    expect(result).toMatchObject({ ok: true, classification: 'Company Internal' });
    expect(files['stanza.yaml']).toContain(
      `'Company Internal': { id: '${GENERAL}', name: General }`,
    );
  });

  it('refuses another label for a recorded classification unless it replaces it', async () => {
    const { files } = await record(project(), CONFIDENTIAL_FILE);
    const general = labelled(STAMPED, GENERAL, TENANT, 'General');
    expect((await record(files, general)).result).toMatchObject({ ok: false, reason: 'differs' });
    expect((await record(files, general, { replace: true })).result).toMatchObject({
      ok: true,
      label: { id: GENERAL, name: 'General' },
      changed: true,
    });
  });

  it('refuses a file of another tenant, without a label, encrypted, or without a classification', async () => {
    const { files } = await record(project(), CONFIDENTIAL_FILE);
    const other = labelled(STAMPED, GENERAL, OTHER_TENANT);
    expect(
      (await record(files, other, { classification: 'Public', replace: true })).result,
    ).toMatchObject({ ok: false, reason: 'other-tenant' });
    expect((await record(files, STAMPED)).result).toMatchObject({ ok: false, reason: 'no-label' });
    const compound = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect((await record(files, compound)).result).toMatchObject({
      ok: false,
      reason: 'encrypted',
    });
    const plain = memoryStorage({
      ...project(),
      'stanza.yaml': "stanza-format: 1\nstylesheet: 'styles/default.yaml'\n",
    });
    expect(await recordSensitivityLabelFromFile(plain, CONFIDENTIAL_FILE)).toMatchObject({
      ok: false,
      reason: 'no-classification',
    });
    expect(plain.texts.has('stanza.yaml')).toBe(false);
  });
});

const RECORDED = `sensitivity-labels:\n  tenant: '${TENANT}'\n  labels:\n    Confidential: { id: '${CONFIDENTIAL}', name: Confidential }\n`;

let counter = 0;

describe('compareLabel (ADR 0087)', () => {
  const compare = async (bytes: Uint8Array, extra: string) => {
    const loaded = await loadProject(memoryStorage(project(extra)));
    const read = readReview(bytes);
    if (!read.ok) throw new Error(read.message);
    const comparison = compareLabel(loaded, REVIEWED, read.review.sensitivityLabels);
    return comparison === undefined ? undefined : labelLine(comparison, 'reviewed.docx');
  };

  it('says whether the label of a file is the one recorded for its classification', async () => {
    expect(await compare(CONFIDENTIAL_FILE, RECORDED)).toBe(
      'Sensitivity label: Confidential, as recorded for the classification "Confidential".',
    );
    expect(await compare(labelled(STAMPED, GENERAL, TENANT, 'General'), RECORDED)).toBe(
      'Sensitivity label: General, not Confidential as recorded for "Confidential". Word or a reviewer changed it; if it is the right one, run "stanza label record reviewed.docx --replace".',
    );
    expect(await compare(CONFIDENTIAL_FILE, '')).toBe(
      'Sensitivity label: Confidential, not recorded for "Confidential". Run "stanza label record reviewed.docx" to record it.',
    );
    expect(await compare(labelled(STAMPED, GENERAL, OTHER_TENANT), RECORDED)).toBe(
      `Sensitivity label: label ${GENERAL}, of another tenant than the one this project records labels for.`,
    );
    expect(await compare(STAMPED, RECORDED)).toBe(
      'The file has no sensitivity label, although one is recorded for "Confidential".',
    );
    // A project without labels says nothing about a file without one.
    expect(await compare(STAMPED, '')).toBeUndefined();
  });

  it('is reported by review pull', async () => {
    const storage = memoryStorage(project(RECORDED));
    const result = await pullReview(storage, CONFIDENTIAL_FILE, {
      fileName: 'reviewed.docx',
      randomBytes: () => Uint8Array.from({ length: 10 }, (_v, i) => (counter++ * 7 + i * 13) % 256),
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.lines).toContain(
      'Sensitivity label: Confidential, as recorded for the classification "Confidential".',
    );
  });
});

describe('unlabelled-classification (ADR 0087)', () => {
  const settings = parseProject(`stanza-format: 1\nstylesheet: s.yaml\n${RECORDED}`).settings;
  const codes = (classification: string | undefined, reviews?: string) =>
    validateMetadata(
      {
        title: 'T',
        fields: {},
        ...(classification !== undefined ? { classification } : {}),
        ...(reviews !== undefined ? { reviews } : {}),
      },
      settings,
    ).map((d) => `${d.severity}:${d.code}`);

  it('warns about a classification without a label once any label is recorded', () => {
    expect(codes('Confidential')).toEqual([]);
    expect(codes('Public')).toEqual(['warning:unlabelled-classification']);
    expect(codes(undefined)).toEqual(['warning:unlabelled-classification']);
    // A review document is never built.
    expect(codes('Public', 'documents/a.stanza.md')).toEqual([]);
    // Without recorded labels, nothing is said.
    expect(
      validateMetadata({ title: 'T', fields: {}, classification: 'Public' }, { fields: undefined }),
    ).toEqual([]);
  });
});
