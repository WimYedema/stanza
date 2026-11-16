export {
  adoptMarkdown,
  type AdoptDiagnostic,
  type AdoptReport,
  type AdoptResult,
} from './adopt.js';
export { assignMissingIdsInText, type AssignIdsInTextResult } from './assign-ids.js';
export { formatAnnotation, parseAnnotation, type Annotation } from './annotation.js';
export { DEFAULT_VARIANTS, declareVariant, type DeclareVariantResult } from './declare-variant.js';
export {
  setProperty,
  unsetProperty,
  type EditFailure,
  type StylesheetEdit,
  type YamlValue,
} from './edit-stylesheet.js';
export { checkDocumentText, checkParsedDocument, type CheckResult } from './check.js';
export { FORMAT_VERSION } from './front-matter.js';
export { blockStartLines, parseDocument, type ParseResult } from './parse.js';
export { parseProject, type ProjectParseResult } from './project.js';
export { serializeDocument } from './serialize.js';
export { slotSource } from './slot-source.js';
export { parseStylesheet, type StylesheetParseResult } from './stylesheet.js';
export { moveValuesToTokens, type UseTokensResult } from './use-tokens.js';
