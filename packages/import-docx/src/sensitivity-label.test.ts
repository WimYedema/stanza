import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readReview } from './review.js';
import { isCompoundFile, normalGuid } from './sensitivity-label.js';

/** Made-up GUIDs: the files of a real tenant stay out of the repository (ADR 0087). */
const TENANT = '9a2c1f0e-4b7d-4c3a-8e21-5f6b7c8d9e0a';
const OTHER_TENANT = '0f1e2d3c-4b5a-4968-8776-655443322110';
const CONFIDENTIAL = '1b3d5f7a-2c4e-4a6b-8d0f-1a2b3c4d5e6f';
const GENERAL = '7e9f0a1b-3c5d-4e7f-9a1b-2c3d4e5f6a7b';

const FIXTURE = readFileSync(
  new URL('../fixtures/review-round-trip/web-replies-resolved-reaction.docx', import.meta.url),
);

/** The fixture with label properties and, when given, a LabelInfo part. */
function labelled(properties: Record<string, string>, labelInfo?: string): Uint8Array {
  const files = unzipSync(FIXTURE);
  const entries = Object.entries(properties).map(
    ([name, value], index) =>
      `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${String(index + 2)}" name="${name}"><vt:lpwstr>${value}</vt:lpwstr></property>`,
  );
  files['docProps/custom.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${entries.join('')}</Properties>`,
  );
  if (labelInfo !== undefined) {
    files['docMetadata/LabelInfo.xml'] = strToU8(
      `<?xml version="1.0" encoding="utf-8" standalone="yes"?><clbl:labelList xmlns:clbl="http://schemas.microsoft.com/office/2020/mipLabelMetadata">${labelInfo}</clbl:labelList>`,
    );
  }
  return zipSync(files);
}

const props = (id: string, fields: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [`MSIP_Label_${id}_${k}`, v]));

const labelsOf = (bytes: Uint8Array) => {
  const read = readReview(bytes);
  if (!read.ok) throw new Error(read.message);
  return read.review.sensitivityLabels;
};

describe('sensitivity labels of a DOCX (ADR 0087)', () => {
  it('finds none in a file without a label', () => {
    expect(labelsOf(FIXTURE)).toEqual([]);
  });

  it('reads the label of the custom properties, with its name', () => {
    const bytes = labelled(
      props(CONFIDENTIAL, {
        Enabled: 'true',
        SetDate: '2026-11-24T10:00:00Z',
        Method: 'Standard',
        Name: 'Confidential',
        SiteId: TENANT,
        ActionId: '00000000-0000-0000-0000-000000000001',
        ContentBits: '0',
      }),
    );
    expect(labelsOf(bytes)).toEqual([
      {
        id: CONFIDENTIAL,
        tenant: TENANT,
        name: 'Confidential',
        method: 'Standard',
        contentBits: 0,
        setDate: '2026-11-24T10:00:00Z',
        from: 'custom-properties',
      },
    ]);
  });

  it('takes the part before the properties for the same tenant, with the name of the properties', () => {
    const bytes = labelled(
      {
        ...props(GENERAL, { Enabled: 'true', SiteId: TENANT, Name: 'General' }),
        ...props(CONFIDENTIAL, { Enabled: 'true', SiteId: TENANT, Name: 'Confidential' }),
      },
      // Braces and capitals, as the specification writes GUIDs, are read the same.
      `<clbl:label id="{${CONFIDENTIAL.toUpperCase()}}" enabled="1" method="Standard" siteId="{${TENANT}}" contentBits="1" removed="0"/>`,
    );
    expect(labelsOf(bytes)).toEqual([
      {
        id: CONFIDENTIAL,
        tenant: TENANT,
        name: 'Confidential',
        method: 'Standard',
        contentBits: 1,
        from: 'label-info',
      },
    ]);
  });

  it('reads a removed label in the part as none, and another tenant from the properties', () => {
    const bytes = labelled(
      {
        ...props(GENERAL, { Enabled: 'true', SiteId: TENANT }),
        ...props(CONFIDENTIAL, { Enabled: 'true', SiteId: OTHER_TENANT }),
      },
      `<clbl:label id="${GENERAL}" enabled="0" method="Standard" siteId="${TENANT}" removed="1"/>`,
    );
    expect(labelsOf(bytes)).toMatchObject([
      { id: CONFIDENTIAL, tenant: OTHER_TENANT, from: 'custom-properties' },
    ]);
  });

  it('leaves out a label of the properties that is not enabled or has no tenant', () => {
    const bytes = labelled({
      ...props(GENERAL, { Enabled: 'false', SiteId: TENANT }),
      ...props(CONFIDENTIAL, { Enabled: 'true' }),
    });
    expect(labelsOf(bytes)).toEqual([]);
  });

  it('tells a compound file, such as one encrypted by its label, from a DOCX', () => {
    const compound = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(isCompoundFile(compound)).toBe(true);
    expect(isCompoundFile(FIXTURE)).toBe(false);
    const read = readReview(compound);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.message).toContain('sensitivity label');
    expect(normalGuid(` {${TENANT.toUpperCase()}} `)).toBe(TENANT);
  });
});
