import type { SensitivityLabel } from '@stanza/core';
import { setYamlProperty, type EditTarget, type StylesheetEdit } from './edit-stylesheet.js';
import { parseProject } from './project.js';

/**
 * Edits of the text of the project file that keep everything else as it is, in the way of the
 * stylesheet edits (ADR 0035): the lines around the change, with their comments, stay.
 */

const hasControl = (text: string): boolean =>
  Array.from(text).some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);

const PROJECT_FILE: EditTarget = {
  noun: 'project file',
  errorsOf: (text) =>
    parseProject(text)
      .diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => ({
        key: [diagnostic.code, diagnostic.path ?? '', diagnostic.message].join('\u0000'),
        message: diagnostic.message,
        path: diagnostic.path,
      })),
  // A classification is written by the author, so any key on one line will do.
  keyAllowed: (key) => key.trim() !== '' && !hasControl(key),
};

/**
 * Records a sensitivity label in the project file for a classification (ADR 0087): the tenant ID,
 * and under `labels` the classification with the ID and name of its label. What is there already
 * is replaced where it stands; what is not is added.
 */
export function recordSensitivityLabel(
  source: string,
  tenant: string,
  classification: string,
  label: SensitivityLabel,
): StylesheetEdit {
  const withTenant = setYamlProperty(
    source,
    ['sensitivity-labels', 'tenant'],
    tenant,
    PROJECT_FILE,
  );
  if (!withTenant.ok) return withTenant;
  return setYamlProperty(
    withTenant.text,
    ['sensitivity-labels', 'labels', classification],
    { id: label.id, ...(label.name !== undefined ? { name: label.name } : {}) },
    PROJECT_FILE,
  );
}
