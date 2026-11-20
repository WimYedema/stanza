import { describe, expect, it } from 'vitest';
import { loadProject } from './load.js';
import { exampleProject, memoryStorage } from './memory-storage.testing.js';
import { applyMigration, planMigration } from './migrate.js';

/** The example project as Phrase wrote it before the rename: the old names in markup and paths. */
function legacyExample(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(exampleProject())) {
    const yaml = path.endsWith('.yaml');
    files[path.replace(/stanza(?=\.yaml$|\.md$)/, 'phrase')] = text
      .replace(/^stanza-format:/gm, 'phrase-format:')
      .replace(/^<!-- stanza:/gm, '<!-- phrase:')
      .replace(/^```stanza-/gm, '```phrase-')
      .replace(/\]\(([^()\s]*?)\.stanza\.md/g, (_link, target: string) => `](${target}.phrase.md`)
      .replace(/\(stanza:/g, '(phrase:')
      .replace(yaml ? /\.stanza\.md/g : /(?!)/, '.phrase.md');
  }
  return files;
}

/** Applies a plan to a copy of `files` and returns the files afterwards. */
async function migrated(files: Record<string, string>): Promise<Record<string, string>> {
  const storage = memoryStorage(files);
  const plan = await planMigration(storage);
  expect(plan.diagnostics).toEqual([]);
  const result = { ...files };
  await applyMigration(storage, plan, (path) => {
    delete result[path];
    return Promise.resolve();
  });
  for (const [path, text] of storage.texts) result[path] = text;
  return result;
}

describe('planMigration', () => {
  it('turns the Phrase example project into the Stanza example project', async () => {
    expect(await migrated(legacyExample())).toEqual(exampleProject());
  });

  it('lists the project file, the stylesheet and the documents with their new names', async () => {
    const plan = await planMigration(memoryStorage(legacyExample()));
    expect(plan.steps.map((step) => `${step.from} -> ${step.to}`)).toEqual([
      'phrase.yaml -> stanza.yaml',
      'styles/default.yaml -> styles/default.yaml',
      'documents/introduction.phrase.md -> documents/introduction.stanza.md',
      'documents/reference.phrase.md -> documents/reference.stanza.md',
    ]);
    expect(plan.steps.every((step) => step.changes > 0)).toBe(true);
  });

  it('gives a project that loads without errors', async () => {
    const loaded = await loadProject(memoryStorage(await migrated(legacyExample())));
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(loaded.documents.map((d) => d.path)).toEqual([
      'documents/introduction.stanza.md',
      'documents/reference.stanza.md',
    ]);
  });

  it('does nothing in a Stanza project', async () => {
    const plan = await planMigration(memoryStorage(exampleProject()));
    expect(plan).toMatchObject({ steps: [], diagnostics: [], alreadyMigrated: true });
  });

  it('refuses when a new name is taken, and plans no step', async () => {
    const files = legacyExample();
    files['documents/introduction.stanza.md'] = files['documents/introduction.phrase.md'] ?? '';
    const plan = await planMigration(memoryStorage(files));
    expect(plan.steps).toEqual([]);
    expect(plan.diagnostics).toMatchObject([
      { file: 'documents/introduction.stanza.md', code: 'migrate-target-exists' },
    ]);
  });

  it('refuses when both project files exist', async () => {
    const plan = await planMigration(memoryStorage({ ...legacyExample(), 'stanza.yaml': '' }));
    expect(plan.diagnostics.map((d) => d.code)).toEqual(['migrate-target-exists']);
  });

  it('notes an AGENTS.md that still describes Phrase, and leaves it alone', async () => {
    const files = { ...legacyExample(), 'AGENTS.md': 'Run `phrase validate`.\n' };
    const plan = await planMigration(memoryStorage(files));
    expect(plan.notes).toEqual([expect.stringContaining('AGENTS.md still describes Phrase')]);
    expect(plan.steps.some((step) => step.from === 'AGENTS.md')).toBe(false);
  });
});

describe('loadProject on a Phrase project', () => {
  it('reports legacy-format on phrase.yaml in place of a missing stanza.yaml', async () => {
    const loaded = await loadProject(memoryStorage(legacyExample()));
    expect(loaded.diagnostics).toMatchObject([
      { file: 'phrase.yaml', severity: 'error', code: 'legacy-format' },
    ]);
  });
});
