import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORD_LABEL_COMMAND, registerRecordLabel } from './record-label-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const PROJECT = `stanza-format: 1
title: 'Project' # kept
stylesheet: 'styles/default.yaml'
`;
const STYLESHEET = `stanza-format: 1
paragraph-styles:
  body: {}
  heading-1: {}
  heading-2: {}
  heading-3: {}
  heading-4: {}
  heading-5: {}
  heading-6: {}
  code: {}
  list-bulleted: {}
  list-numbered: {}
table-styles:
  table: {}
`;
const DOCUMENT = '/w/p/documents/one.stanza.md';
const FIRST = `---\nstanza-format: 1\ntitle: "T"\n---\n\n<!-- stanza: #k7m2q9x4zb -->\n# One\n\nSome text.\n`;
const WORD_FILE = '/w/docs/labelled.docx';

/** Made-up GUIDs, as in the tests of `project` (ADR 0087). */
const TENANT = '9a2c1f0e-4b7d-4c3a-8e21-5f6b7c8d9e0a';
const GENERAL = '7e9f0a1b-3c5d-4e7f-9a1b-2c3d4e5f6a7b';
const CONFIDENTIAL = '1b3d5f7a-2c4e-4a6b-8d0f-1a2b3c4d5e6f';

/** A labelled DOCX with the bookmark of the document's heading, so it is of `one.stanza.md`. */
function labelled(id: string, name: string): Uint8Array {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const fields = { Enabled: 'true', SiteId: TENANT, Name: name };
  const properties = Object.entries(fields)
    .map(
      ([field, value], index) =>
        `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${String(index + 2)}" name="MSIP_Label_${id}_${field}"><vt:lpwstr>${value}</vt:lpwstr></property>`,
    )
    .join('');
  return zipSync({
    'word/document.xml': strToU8(
      `<w:document ${W}><w:body><w:p><w:bookmarkStart w:id="1" w:name="stanza_k7m2q9x4zb"/><w:r><w:t>One</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p></w:body></w:document>`,
    ),
    'docProps/custom.xml': strToU8(
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${properties}</Properties>`,
    ),
  });
}

async function run(): Promise<void> {
  registerRecordLabel();
  const handler = world.commandHandlers.get(RECORD_LABEL_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

/** The project file as its buffer has it: the label is an edit of the buffer (ADR 0079). */
const projectText = (): string =>
  world.open.get('/w/p/stanza.yaml')?.text ?? world.files.get('/w/p/stanza.yaml') ?? '';

beforeEach(() => {
  reset(
    {
      '/w/p/stanza.yaml': PROJECT,
      '/w/p/styles/default.yaml': STYLESHEET,
      [DOCUMENT]: FIRST,
    },
    DOCUMENT,
    FIRST,
  );
  world.binary.set(WORD_FILE, labelled(GENERAL, 'General'));
  world.dialogFolder = WORD_FILE;
});

describe('Stanza: Record Sensitivity Label (ADR 0087)', () => {
  it('asks for the classification of a document without one, and records the label', async () => {
    world.inputValue = 'Internal';
    await run();
    expect(world.errors).toEqual([]);
    expect(projectText()).toBe(
      `${PROJECT}sensitivity-labels:\n  tenant: '${TENANT}'\n  labels:\n    Internal: { id: '${GENERAL}', name: General }\n`,
    );
    expect(world.infos).toEqual([
      'Stanza: recorded General for the classification "Internal" in stanza.yaml. Save the project file to keep this change.',
    ]);
    // The edit is in the buffer until it is saved.
    expect(world.files.get('/w/p/stanza.yaml')).toBe(PROJECT);
  });

  it('saves the project file when asked to', async () => {
    world.inputValue = 'Internal';
    world.infoChoice = 'Save project file';
    await run();
    expect(world.saved).toEqual(['/w/p/stanza.yaml']);
    expect(world.files.get('/w/p/stanza.yaml')).toContain('sensitivity-labels:');
  });

  it('asks before replacing another label, and leaves the file when the answer is no', async () => {
    world.inputValue = 'Internal';
    await run();
    const recorded = projectText();
    world.binary.set(WORD_FILE, labelled(CONFIDENTIAL, 'Confidential'));
    world.warningChoice = undefined;
    await run();
    expect(world.warnings.at(-1)).toContain('Replace it?');
    expect(projectText()).toBe(recorded);
    world.warningChoice = 'Replace';
    await run();
    expect(projectText()).toContain(`Internal: { id: '${CONFIDENTIAL}', name: Confidential }`);
  });

  it('says why nothing was recorded for a file without a label', async () => {
    world.binary.set(
      WORD_FILE,
      zipSync({
        'word/document.xml': strToU8(
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
        ),
      }),
    );
    await run();
    expect(world.errors).toEqual([
      'Stanza: no label was recorded. The file has no sensitivity label. Label it in Word first.',
    ]);
    expect(projectText()).toBe(PROJECT);
  });
});
