import { migrateLegacyDocument, migrateLegacyYaml, parseProject } from '@stanza/format';
import { hasErrors, inFile, type ProjectDiagnostic } from './diagnostics.js';
import { DOCUMENT_SUFFIX, PROJECT_FILE, findDocuments } from './files.js';
import type { ProjectStorage } from './storage.js';

/** The names of a project from before Phrase was renamed to Stanza (ADR 0083). */
export const LEGACY_PROJECT_FILE = 'phrase.yaml';
export const LEGACY_DOCUMENT_SUFFIX = '.phrase.md';

/** One file of the migration: written at `to` with `text`, and removed at `from` when they differ. */
export interface MigrationStep {
  readonly from: string;
  readonly to: string;
  readonly text: string;
  /** How many places in the text changed. */
  readonly changes: number;
}

export interface MigrationPlan {
  /** The project file first, then the stylesheet, then the documents by path. Empty on errors. */
  readonly steps: readonly MigrationStep[];
  readonly diagnostics: readonly ProjectDiagnostic[];
  /** Things the migration leaves to the author, one sentence each. */
  readonly notes: readonly string[];
  /** True when the project is already a Stanza project. */
  readonly alreadyMigrated: boolean;
}

const AGENT_FILE = 'AGENTS.md';

async function tryRead(storage: ProjectStorage, path: string): Promise<string | undefined> {
  try {
    return await storage.readText(path);
  } catch {
    return undefined;
  }
}

const renamed = (path: string): string =>
  `${path.slice(0, -LEGACY_DOCUMENT_SUFFIX.length)}${DOCUMENT_SUFFIX}`;

/**
 * Plans the migration of a Phrase project to Stanza: `phrase.yaml` becomes `stanza.yaml`, every
 * `*.phrase.md` becomes `*.stanza.md`, and the texts are rewritten by `migrateLegacyDocument` and
 * `migrateLegacyYaml`. IDs do not change, so references keep working. Nothing is written here.
 * The plan is refused, with diagnostics, when a target exists or the project file is invalid.
 */
export async function planMigration(storage: ProjectStorage): Promise<MigrationPlan> {
  const diagnostics: ProjectDiagnostic[] = [];
  const refused = (): MigrationPlan => ({
    steps: [],
    diagnostics,
    notes: [],
    alreadyMigrated: false,
  });
  const legacyProject = await tryRead(storage, LEGACY_PROJECT_FILE);
  const current = await tryRead(storage, PROJECT_FILE);
  if (legacyProject === undefined) {
    if (current !== undefined) {
      return { steps: [], diagnostics, notes: [], alreadyMigrated: true };
    }
    diagnostics.push({
      file: LEGACY_PROJECT_FILE,
      severity: 'error',
      code: 'file-unreadable',
      message: `There is no ${LEGACY_PROJECT_FILE} or ${PROJECT_FILE} here, so this is not a project.`,
    });
    return refused();
  }
  if (current !== undefined) {
    diagnostics.push({
      file: PROJECT_FILE,
      severity: 'error',
      code: 'migrate-target-exists',
      message: `Both ${LEGACY_PROJECT_FILE} and ${PROJECT_FILE} exist. Remove the one that is not the project, then migrate again.`,
    });
    return refused();
  }

  const project = migrateLegacyYaml(legacyProject);
  const parsed = parseProject(project.text);
  diagnostics.push(...inFile(LEGACY_PROJECT_FILE, parsed.diagnostics));
  if (hasErrors(parsed.diagnostics)) return refused();
  const steps: MigrationStep[] = [
    { from: LEGACY_PROJECT_FILE, to: PROJECT_FILE, text: project.text, changes: project.changes },
  ];

  const stylesheetPath = parsed.settings.stylesheet;
  const stylesheetText = await tryRead(storage, stylesheetPath);
  if (stylesheetText === undefined) {
    diagnostics.push({
      file: stylesheetPath,
      severity: 'error',
      code: 'file-unreadable',
      message: `The stylesheet named in ${LEGACY_PROJECT_FILE} cannot be read.`,
    });
    return refused();
  }
  const stylesheet = migrateLegacyYaml(stylesheetText);
  steps.push({
    from: stylesheetPath,
    to: stylesheetPath,
    text: stylesheet.text,
    changes: stylesheet.changes,
  });

  const existing = new Set(await findDocuments(storage));
  for (const path of await findDocuments(storage, LEGACY_DOCUMENT_SUFFIX)) {
    const to = renamed(path);
    if (existing.has(to)) {
      diagnostics.push({
        file: to,
        severity: 'error',
        code: 'migrate-target-exists',
        message: `${path} would become ${to}, which exists already.`,
      });
      continue;
    }
    const text = await tryRead(storage, path);
    if (text === undefined) {
      diagnostics.push({
        file: path,
        severity: 'error',
        code: 'file-unreadable',
        message: 'Cannot read the document.',
      });
      continue;
    }
    const document = migrateLegacyDocument(text);
    steps.push({ from: path, to, text: document.text, changes: document.changes });
  }
  if (hasErrors(diagnostics)) return refused();

  const notes: string[] = [];
  const agents = await tryRead(storage, AGENT_FILE);
  if (agents !== undefined && /phrase/i.test(agents)) {
    notes.push(
      `${AGENT_FILE} still describes Phrase. It is yours, so it is left as it is: update it, or delete it and run "Stanza: Add Agent Instructions".`,
    );
  }
  return { steps, diagnostics, notes, alreadyMigrated: false };
}

/**
 * Carries out a plan: every new text is written first, and only then are the renamed files
 * removed, so a failed write leaves all the old files in place. `remove` deletes one file by its
 * project-relative path; the storage port has no deletion, since only this needs one.
 */
export async function applyMigration(
  storage: ProjectStorage,
  plan: MigrationPlan,
  remove: (path: string) => Promise<void>,
): Promise<void> {
  for (const step of plan.steps) await storage.writeText(step.to, step.text);
  for (const step of plan.steps) if (step.from !== step.to) await remove(step.from);
}
