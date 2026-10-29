export { buildProject, outputPath, type BuildOptions, type BuildResult } from './build.js';
export { hasErrors, type ProjectDiagnostic } from './diagnostics.js';
export {
  DOCUMENT_SUFFIX,
  PROJECT_FILE,
  loadProject,
  type LoadedDocument,
  type LoadedProject,
} from './load.js';
export type { DirectoryEntry, ProjectStorage } from './storage.js';
