import { applyDefaults, labelOf, type SensitivityLabel } from '@stanza/core';
import { parseProject, recordSensitivityLabel } from '@stanza/format';
import { isCompoundFile, readReview, type FileLabel } from '@stanza/import-docx';
import { PROJECT_FILE } from './files.js';
import { loadProject, type LoadedProject } from './load.js';
import { inspectReview } from './review.js';
import type { ProjectStorage } from './storage.js';
import { NO_PROJECT_MESSAGE } from './store-document.js';

/**
 * Sensitivity labels (ADR 0087): what the label of a file is against the label the project records
 * for the classification of its document, and recording the label of a file in the project file.
 */

/** How the label of a file compares with the project. */
export type LabelComparison =
  /** The file has the label recorded for the classification of its document. */
  | {
      readonly kind: 'matches';
      readonly classification: string;
      readonly label: FileLabel;
    }
  /** The file has another label than the one recorded, as when Word or a reviewer changed it. */
  | {
      readonly kind: 'differs';
      readonly classification: string;
      readonly recorded: SensitivityLabel;
      readonly label: FileLabel;
    }
  /** The file has a label that the project does not record for the classification. */
  | {
      readonly kind: 'not-recorded';
      readonly classification?: string;
      readonly label: FileLabel;
    }
  /** The file has only labels of another tenant than the project's. */
  | { readonly kind: 'other-tenant'; readonly label: FileLabel }
  /** The file has no label, although one is recorded for the classification of its document. */
  | { readonly kind: 'none-in-file'; readonly classification: string };

/** The effective classification of a document of the project, with the project defaults. */
function classificationOf(loaded: LoadedProject, document: string | undefined): string | undefined {
  const entry = loaded.documents.find((candidate) => candidate.path === document);
  if (entry === undefined || loaded.settings === undefined) return undefined;
  return applyDefaults(loaded.settings, entry.document.meta).classification;
}

/** The label of the file for the tenant of the project, or the only one when it records none. */
function labelForProject(
  loaded: LoadedProject,
  labels: readonly FileLabel[],
): FileLabel | 'other-tenant' | undefined {
  const tenant = loaded.settings?.sensitivityLabels?.tenant.toLowerCase();
  if (tenant === undefined) return labels[0];
  const own = labels.find((label) => label.tenant === tenant);
  return own ?? (labels.length > 0 ? 'other-tenant' : undefined);
}

/**
 * The label of a file against the project, for the document it was built from. Undefined when
 * there is nothing to say: the file has no label, and none is recorded for its document.
 */
export function compareLabel(
  loaded: LoadedProject,
  document: string | undefined,
  labels: readonly FileLabel[],
): LabelComparison | undefined {
  const settings = loaded.settings;
  if (settings === undefined) return undefined;
  const classification = classificationOf(loaded, document);
  const recorded = labelOf(settings, classification);
  const label = labelForProject(loaded, labels);
  if (label === 'other-tenant') {
    const first = labels[0];
    return first === undefined ? undefined : { kind: 'other-tenant', label: first };
  }
  if (label === undefined) {
    return recorded !== undefined && classification !== undefined
      ? { kind: 'none-in-file', classification }
      : undefined;
  }
  if (classification === undefined || recorded === undefined) {
    return {
      kind: 'not-recorded',
      ...(classification !== undefined ? { classification } : {}),
      label,
    };
  }
  return recorded.id.toLowerCase() === label.id
    ? { kind: 'matches', classification, label }
    : { kind: 'differs', classification, recorded, label };
}

const nameOf = (label: FileLabel): string => label.name ?? `label ${label.id}`;

/** The comparison as a line for the review commands, naming the file for the command to run. */
export function labelLine(comparison: LabelComparison, fileName: string): string {
  const record = `stanza label record ${fileName}`;
  switch (comparison.kind) {
    case 'matches':
      return `Sensitivity label: ${nameOf(comparison.label)}, as recorded for the classification "${comparison.classification}".`;
    case 'differs':
      return `Sensitivity label: ${nameOf(comparison.label)}, not ${comparison.recorded.name ?? `label ${comparison.recorded.id}`} as recorded for "${comparison.classification}". Word or a reviewer changed it; if it is the right one, run "${record} --replace".`;
    case 'not-recorded':
      return comparison.classification === undefined
        ? `Sensitivity label: ${nameOf(comparison.label)}, not recorded. The document has no classification, so run "${record} --classification <value>".`
        : `Sensitivity label: ${nameOf(comparison.label)}, not recorded for "${comparison.classification}". Run "${record}" to record it.`;
    case 'other-tenant':
      return `Sensitivity label: ${nameOf(comparison.label)}, of another tenant than the one this project records labels for.`;
    case 'none-in-file':
      return `The file has no sensitivity label, although one is recorded for "${comparison.classification}".`;
  }
}

export interface RecordLabelOptions {
  /** The classification to record the label for, instead of that of the stamped document. */
  readonly classification?: string;
  /** Replace a different label that is recorded for the classification. */
  readonly replace?: boolean;
}

export type RecordLabelResult =
  | {
      readonly ok: true;
      readonly classification: string;
      readonly label: SensitivityLabel;
      readonly tenant: string;
      /** False when the project file already recorded this label for the classification. */
      readonly changed: boolean;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'no-project'
        | 'encrypted'
        | 'not-a-docx'
        | 'unreadable'
        | 'no-label'
        | 'several-tenants'
        | 'other-tenant'
        | 'no-classification'
        | 'differs'
        | 'not-written';
      readonly message: string;
    };

const refuse = (
  reason: Extract<RecordLabelResult, { ok: false }>['reason'],
  message: string,
): RecordLabelResult => ({ ok: false, reason, message });

/**
 * Records the sensitivity label of a DOCX that Word labelled in the project file (ADR 0087), for
 * the classification of the document the file was built from, or the one given. The rest of the
 * project file is kept as it is.
 */
export async function recordSensitivityLabelFromFile(
  storage: ProjectStorage,
  bytes: Uint8Array,
  options: RecordLabelOptions = {},
): Promise<RecordLabelResult> {
  if (isCompoundFile(bytes)) {
    return refuse(
      'encrypted',
      'The file is encrypted, by its sensitivity label or a password. Stanza cannot write a label that encrypts; record a label without encryption.',
    );
  }
  const loaded = await loadProject(storage);
  const settings = loaded.settings;
  if (settings === undefined || loaded.stylesheet === undefined) {
    return refuse('no-project', NO_PROJECT_MESSAGE);
  }
  const read = readReview(bytes);
  if (!read.ok) return refuse(read.reason, read.message);
  const labels = read.review.sensitivityLabels;
  if (labels.length === 0) {
    return refuse('no-label', 'The file has no sensitivity label. Label it in Word first.');
  }
  const label = labelForProject(loaded, labels);
  if (label === 'other-tenant') {
    return refuse(
      'other-tenant',
      `The label of the file belongs to another tenant than ${settings.sensitivityLabels?.tenant ?? ''}, which this project records labels for.`,
    );
  }
  if (label === undefined) return refuse('no-label', 'The file has no sensitivity label.');
  if (settings.sensitivityLabels === undefined && labels.length > 1) {
    return refuse(
      'several-tenants',
      'The file has labels of several tenants, so the tenant of the project is not clear.',
    );
  }

  const document = inspectReview(loaded, read.review, () => undefined).document;
  const classification = options.classification ?? classificationOf(loaded, document);
  if (classification === undefined || classification.trim() === '') {
    return refuse(
      'no-classification',
      document === undefined
        ? 'The file is not a document of this project, so the classification is not known. Give it with --classification.'
        : `${document} has no classification. Give one in the document or with --classification.`,
    );
  }
  const recorded = labelOf(settings, classification);
  if (
    recorded !== undefined &&
    recorded.id.toLowerCase() !== label.id &&
    options.replace !== true
  ) {
    return refuse(
      'differs',
      `"${classification}" already has ${recorded.name ?? `label ${recorded.id}`} recorded, not ${nameOf(label)}. Give --replace to record the label of the file instead.`,
    );
  }
  const name = label.name ?? (recorded?.id.toLowerCase() === label.id ? recorded.name : undefined);
  const next: SensitivityLabel = { id: label.id, ...(name !== undefined ? { name } : {}) };

  const before = await storage.readText(PROJECT_FILE);
  const edit = recordSensitivityLabel(before, label.tenant, classification, next);
  if (!edit.ok) return refuse('not-written', `${PROJECT_FILE} was not changed. ${edit.message}`);
  const changed = edit.text !== before;
  if (changed) {
    if ((await storage.readText(PROJECT_FILE)) !== before) {
      return refuse(
        'not-written',
        `${PROJECT_FILE} changed while the label was recorded. Try again.`,
      );
    }
    await storage.writeText(PROJECT_FILE, edit.text);
  }
  // What was written reads back as the label, or the edit would have been refused.
  const written = labelOf(parseProject(edit.text).settings, classification) ?? next;
  return { ok: true, classification, label: written, tenant: label.tenant, changed };
}
