import type { DocxParts } from './docx-package.js';
import { textProperties } from './review-parts.js';
import { elementsOf } from './xml.js';

/**
 * The sensitivity labels of a DOCX (ADR 0087), as Office writes them: in the part
 * `docMetadata/LabelInfo.xml`, and in the custom file properties `MSIP_Label_<label ID>_<name>`.
 * Nothing here knows the project; the project compares what is found with what it recorded.
 */

/** A label found in a file, for one tenant. */
export interface FileLabel {
  /** The label ID, lowercase and without braces. */
  readonly id: string;
  /** The tenant ID (`siteId`, `SiteId`), lowercase and without braces. */
  readonly tenant: string;
  /** The name of the label, from the properties; the part has none. */
  readonly name?: string;
  /** `Standard`, `Privileged` or `Auto`, as written. */
  readonly method?: string;
  /** What the label applied: 1 header, 2 footer, 4 watermark, 8 encryption. */
  readonly contentBits?: number;
  /** When the label was set, from the properties, as written. */
  readonly setDate?: string;
  /** Where it was read: the part wins over the properties for the same tenant. */
  readonly from: 'label-info' | 'custom-properties';
}

/** A GUID as the project file writes it: lowercase, without braces. */
export const normalGuid = (value: string): string =>
  value
    .trim()
    .replace(/^\{(.*)\}$/, '$1')
    .toLowerCase();

const isTrue = (value: string | undefined): boolean =>
  value !== undefined && /^(1|true)$/i.test(value.trim());

const bitsOf = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
};

const PROPERTY = /^MSIP_Label_([0-9A-Fa-f{}-]+)_([A-Za-z]+)$/;

/** The labels in the custom file properties, by label ID: the ones that are enabled. */
function propertyLabels(parts: DocxParts): FileLabel[] {
  const byLabel = new Map<string, Map<string, string>>();
  for (const [name, value] of textProperties(parts.customProperties)) {
    const match = PROPERTY.exec(name);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const id = normalGuid(match[1]);
    const fields = byLabel.get(id) ?? new Map<string, string>();
    fields.set(match[2], value);
    byLabel.set(id, fields);
  }
  const found: FileLabel[] = [];
  for (const [id, fields] of byLabel) {
    const tenant = fields.get('SiteId');
    if (!isTrue(fields.get('Enabled')) || tenant === undefined) continue;
    const name = fields.get('Name');
    const method = fields.get('Method');
    const contentBits = bitsOf(fields.get('ContentBits'));
    const setDate = fields.get('SetDate');
    found.push({
      id,
      tenant: normalGuid(tenant),
      ...(name !== undefined && name !== '' ? { name } : {}),
      ...(method !== undefined ? { method } : {}),
      ...(contentBits !== undefined ? { contentBits } : {}),
      ...(setDate !== undefined ? { setDate } : {}),
      from: 'custom-properties',
    });
  }
  return found;
}

/**
 * The labels of a file, at most one per tenant, as Office reads them (MS-OFFCRYPTO 2.6.3): a tenant
 * with a `label` element in the part takes it from there, and none when it is `removed`; another
 * tenant takes the enabled label of the properties. The name comes from the properties, also for a
 * label read from the part, since the part has none.
 */
export function sensitivityLabelsOf(parts: DocxParts): FileLabel[] {
  const fromProperties = propertyLabels(parts);
  const found: FileLabel[] = [];
  const decided = new Set<string>();
  for (const label of elementsOf(parts.labelInfo, 'label')) {
    const id = label.attrs['id'];
    const tenant = label.attrs['siteId'];
    if (id === undefined || tenant === undefined) continue;
    const siteId = normalGuid(tenant);
    if (decided.has(siteId)) continue;
    decided.add(siteId);
    if (isTrue(label.attrs['removed']) || !isTrue(label.attrs['enabled'])) continue;
    const labelId = normalGuid(id);
    const same = fromProperties.find((p) => p.id === labelId && p.tenant === siteId);
    const method = label.attrs['method'];
    const contentBits = bitsOf(label.attrs['contentBits']);
    found.push({
      id: labelId,
      tenant: siteId,
      ...(same?.name !== undefined ? { name: same.name } : {}),
      ...(method !== undefined ? { method } : {}),
      ...(contentBits !== undefined ? { contentBits } : {}),
      ...(same?.setDate !== undefined ? { setDate: same.setDate } : {}),
      from: 'label-info',
    });
  }
  for (const label of fromProperties) {
    if (decided.has(label.tenant)) continue;
    decided.add(label.tenant);
    found.push(label);
  }
  return found;
}

/**
 * Whether the bytes are an OLE compound file rather than a ZIP: an old `.doc`, or a DOCX encrypted
 * by its sensitivity label or a password, whose package is inside an `EncryptedPackage` stream.
 */
export const isCompoundFile = (bytes: Uint8Array): boolean =>
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);
