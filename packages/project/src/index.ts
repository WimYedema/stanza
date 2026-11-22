export {
  AGENT_INSTRUCTIONS,
  AGENT_INSTRUCTIONS_FILE,
  addAgentInstructions,
  type AddAgentInstructionsResult,
} from './agent-instructions.js';
export {
  adoptMarkdownDocument,
  type AdoptMarkdownOptions,
  type AdoptMarkdownResult,
} from './adopt-markdown.js';
export {
  DEFAULT_BUILD_DATE,
  buildProject,
  outputPath,
  type BuildOptions,
  type BuildResult,
} from './build.js';
export { exportDocument, type ExportDocumentResult } from './export-document.js';
export type { SourceRevisions } from './revisions.js';
export {
  formatDocuments,
  formatProject,
  type FormatOptions,
  type FormatResult,
  type FormatStatus,
} from './format.js';
export { hasErrors, type ProjectDiagnostic } from './diagnostics.js';
export {
  useTokensInStylesheet,
  type FixStylesheetOptions,
  type FixStylesheetResult,
} from './fix-stylesheet.js';
export {
  describeImport,
  importWordDocument,
  type ImportWordOptions,
  type ImportWordResult,
} from './import-word.js';
export { DEFAULT_STYLESHEET } from './default-stylesheet.js';
export { addDocument, type NewDocumentOptions, type NewDocumentResult } from './new-document.js';
export {
  createProject,
  slugOf,
  type NewProjectOptions,
  type NewProjectResult,
} from './new-project.js';
export { DOCUMENT_SUFFIX, PROJECT_FILE } from './files.js';
export {
  LEGACY_DOCUMENT_SUFFIX,
  LEGACY_PROJECT_FILE,
  applyMigration,
  planMigration,
  type MigrationPlan,
  type MigrationStep,
} from './migrate.js';
export { initializeDocumentList } from './document-list.js';
export {
  loadProject,
  loadProjectConfiguration,
  type ProjectConfiguration,
  type LoadedDocument,
  type LoadedProject,
} from './load.js';
export { styleUsage, type StyleUse, type StyleUsage, type UseKind } from './style-usage.js';
export type { DirectoryEntry, ProjectStorage } from './storage.js';
