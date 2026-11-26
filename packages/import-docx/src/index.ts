export { importDocx, type ImportResult } from './import-docx.js';
export type { ReadFailure } from './docx-package.js';
export type { ImportDiagnostic, ImportReport, StyleUse } from './report.js';
export {
  readReview,
  type CommentPlacement,
  type ReadReviewResult,
  type ReviewComment,
  type ReviewReading,
} from './review.js';
export type { EmbeddedSource, Reaction, ReviewStamp } from './review-parts.js';
export {
  readBodyText,
  type BodyText,
  type DocxParagraph,
  type ReadBodyResult,
  type TrackedChange,
} from './review-text.js';
export {
  importCoverTemplate,
  type CoverTemplateImport,
  type CoverTemplateOptions,
  type CoverTemplateResult,
  type ImportedBorder,
  type ImportedParagraphStyle,
  type ImportedTableStyle,
} from './cover-template.js';
