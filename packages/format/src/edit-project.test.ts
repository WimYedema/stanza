import { describe, expect, it } from 'vitest';
import { recordSensitivityLabel } from './edit-project.js';
import { parseProject } from './project.js';

const TENANT = '9a2c1f0e-4b7d-4c3a-8e21-5f6b7c8d9e0a';
const ID = '1b3d5f7a-2c4e-4a6b-8d0f-1a2b3c4d5e6f';
const OTHER = '7e9f0a1b-3c5d-4e7f-9a1b-2c3d4e5f6a7b';
const BASE = "stanza-format: 1\ntitle: 'Docs' # the title\nstylesheet: 'styles/default.yaml'\n";

const textOf = (result: ReturnType<typeof recordSensitivityLabel>): string => {
  if (!result.ok) throw new Error(result.message);
  return result.text;
};

describe('recordSensitivityLabel (ADR 0087)', () => {
  it('adds the labels at the end, and keeps the rest of the file with its comments', () => {
    const text = textOf(
      recordSensitivityLabel(BASE, TENANT, 'Confidential', { id: ID, name: 'Confidential' }),
    );
    expect(text).toBe(
      `${BASE}sensitivity-labels:\n  tenant: '${TENANT}'\n  labels:\n    Confidential: { id: '${ID}', name: Confidential }\n`,
    );
    expect(parseProject(text).diagnostics).toEqual([]);
    expect(parseProject(text).settings.sensitivityLabels?.labels['Confidential']).toEqual({
      id: ID,
      name: 'Confidential',
    });
  });

  it('adds another classification, quoted when it is not one word, and replaces one in place', () => {
    const first = textOf(recordSensitivityLabel(BASE, TENANT, 'Confidential', { id: ID }));
    const second = textOf(
      recordSensitivityLabel(first, TENANT, 'Company Internal', { id: OTHER, name: 'General' }),
    );
    expect(second).toContain(`    'Company Internal': { id: '${OTHER}', name: General }\n`);
    const replaced = textOf(recordSensitivityLabel(second, TENANT, 'Confidential', { id: OTHER }));
    expect(parseProject(replaced).settings.sensitivityLabels).toEqual({
      tenant: TENANT,
      labels: { Confidential: { id: OTHER }, 'Company Internal': { id: OTHER, name: 'General' } },
    });
    // The same label again changes nothing.
    expect(textOf(recordSensitivityLabel(replaced, TENANT, 'Confidential', { id: OTHER }))).toBe(
      replaced,
    );
  });

  it('keeps line endings, and refuses what would make the file invalid', () => {
    const crlf = textOf(
      recordSensitivityLabel(BASE.replaceAll('\n', '\r\n'), TENANT, 'A', { id: ID }),
    );
    expect(crlf.includes('\n') && !/[^\r]\n/.test(crlf)).toBe(true);
    const refused = recordSensitivityLabel(BASE, 'not-a-guid', 'A', { id: ID });
    expect(refused).toMatchObject({ ok: false, code: 'invalid-result' });
    if (!refused.ok)
      expect(refused.message).toContain('The change would make the project file invalid');
    expect(recordSensitivityLabel('a: [', TENANT, 'A', { id: ID })).toMatchObject({
      ok: false,
      code: 'invalid-stylesheet',
      message: 'The project file is not valid YAML, so it was not changed.',
    });
  });
});
