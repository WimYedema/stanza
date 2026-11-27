export { isNodeId, nodeIdFromRandomBytes, type NodeId } from './ids.js';
export { assignMissingIds, type AssignIdsOptions, type AssignIdsResult } from './assign-ids.js';
export { isStyleName, type StyleName } from './style-name.js';
export type {
  DeclareVariantFix,
  Diagnostic,
  DocumentListFix,
  Fix,
  Severity,
  UseTokensFix,
} from './diagnostic.js';
export type {
  Block,
  CellBlock,
  CodeBlock,
  CodeMark,
  Document,
  DocumentMeta,
  EmphasisMark,
  Heading,
  HeadingLevel,
  Inline,
  LinkMark,
  List,
  ListItem,
  ListItemBlock,
  Mark,
  MetaValue,
  Paragraph,
  StanzaBlock,
  StrongMark,
  StyleMark,
  Table,
  TableCell,
  Text,
} from './document.js';
export { normalizeDocument, normalizeInlines } from './normalize.js';
export {
  SOURCE_PART_NAMESPACE,
  SOURCE_STAMP_PROPERTIES,
  contentHash,
  normalizeLineEndings,
  sha256Hex,
  type SourceRevision,
  type SourceStamp,
} from './source-stamp.js';
export {
  resolveLink,
  validateLinkSchemes,
  type LinkSchemes,
  type ResolvedLink,
} from './link-schemes.js';
export { plainCell, plainCellInlines } from './table-cell.js';
export { BLOCK_ATTRIBUTES, MARK_ATTRIBUTES, MARK_TYPES, needsId } from './vocabulary.js';
export { KNOWN_STANZA_KINDS, validateDocument } from './document-validation.js';
export { coverOverflows, type CoverOverflow } from './cover-fit.js';
export { BODY_STYLE, CODE_STYLE, LIST_STYLES, defaultHeadingStyle } from './default-styles.js';
export { collectBlockIds, type BlockId } from './document-ids.js';
export {
  findBroken,
  findIncoming,
  indexReferences,
  resolveReference,
  type Reference,
  type ReferenceIndex,
  type ReferenceTarget,
} from './references.js';
export {
  checkReferencePaths,
  fixReferencePaths,
  findProjectBroken,
  findProjectIncoming,
  indexProjectReferences,
  projectIds,
  resolveProjectReference,
  type ProjectReference,
  type ProjectReferenceIndex,
  type ProjectTarget,
} from './project-references.js';
export {
  mapDocumentLinks,
  parseReferenceLink,
  referenceFile,
  relativeReferenceFile,
  type ReferenceLink,
} from './reference-links.js';
export {
  suggestReferences,
  type ReferenceSuggestion,
  type SuggestionMatch,
} from './reference-suggestions.js';
export {
  DEFAULT_TOC_DEPTH,
  MAX_TOC_DEPTH,
  TOC_STANZA_KIND,
  collectTocEntries,
  readTocOptions,
  tocStyleName,
  type TocEntry,
  type TocOptions,
} from './toc.js';
export {
  MIN_TEXT_AREA_PT,
  PAGE_SIZES,
  PAGE_SIZE_NAMES,
  PAGE_TEMPLATE_FIELD,
  resolvePageTemplate,
} from './page-template.js';
export { numberHeadings, type HeadingNumbers } from './heading-numbering.js';
export { maxHeadingLevel } from './heading-levels.js';
export { slotText, slotValue } from './slot-values.js';
export {
  COVER_END_RESERVE_PT,
  coverAreaHeightPt,
  coverAreaWidthPt,
  coverBlocks,
  coverMargins,
  coverRowHeightsPt,
  coverColumnWidthsPt,
  coverGrid,
  fillCover,
  fillGrid,
  placeAreas,
  fillEntries,
  titleBlockBlocks,
  type CoverItem,
  type FilledArea,
  type FilledCoverRow,
  type GridShape,
  type PlacedArea,
} from './cover.js';
export {
  areaOrder,
  entriesGrid,
  gridEntries,
  gridRows,
  insertColumn,
  insertRow,
  isAreaName,
  newAreaName,
  removeColumn,
  removeRow,
  renameArea,
  setArea,
  setCells,
  setColumn,
  setRow,
  slotsGrid,
  type CellRange,
  type GridEdit,
} from './grid-edit.js';
export {
  naturalWidthPt,
  readImageInfo,
  type ImageAsset,
  type ImageFormat,
  type ImageInfo,
} from './image-info.js';
export {
  HARDCODED_FIELD_NAMES,
  REVIEW_PROTECTIONS,
  applyDefaults,
  isSafeRelativePath,
  outlinePaths,
  validateMetadata,
  validateProjectSettings,
  type FieldDeclaration,
  type FieldType,
  type OutlineEntry,
  type ProjectDefaults,
  type ProjectSettings,
  type ReviewProtection,
} from './project.js';
export {
  BUILT_IN_PAGE_TEMPLATE,
  COVER_ALIGNMENTS,
  EMPTY_AREA,
  DEFAULT_PAGE_TEMPLATE_NAME,
  DEFAULT_TABLE_OF_CONTENTS,
  PAGINATION_TOKENS,
  RESERVED_PARAGRAPH_STYLES,
  RESERVED_TABLE_STYLE,
  SLOT_TOKENS,
  VARIANT_MARKS,
  coverEntries,
  coverImagePaths,
  type Alignment,
  type BandedRows,
  type Border,
  type CharacterStyle,
  type ColorValue,
  type Cover,
  type CoverAlignment,
  type CoverArea,
  type CoverColumnWidth,
  type CoverGrid,
  type CoverEntry,
  type CoverImage,
  type CoverLayoutRow,
  type CoverRow,
  type CoverRowHeight,
  type FontValue,
  type HeaderRow,
  type HeaderFooter,
  type LineSpacing,
  type PageMargins,
  type PageSize,
  type PageTemplate,
  type ParagraphProps,
  type ParagraphStyle,
  type SlotPart,
  type SlotToken,
  type Stylesheet,
  type TableOfContentsOptions,
  type TableBorders,
  type TableStyle,
  type TextProps,
  type Tokens,
  type VariantDeclaration,
  type VariantMark,
} from './stylesheet.js';
export {
  inheritanceChain,
  markAllowed,
  resolveCharacterStyle,
  resolveParagraphStyle,
  resolveTableStyle,
  resolveTextProps,
  type InheritanceChain,
  type ResolvedParagraphStyle,
  type ResolvedTableStyle,
} from './style-resolution.js';
export { validateStylesheet } from './style-validation.js';
export { isReservedStyle, styleReferences, type StyleFamily } from './style-references.js';
export {
  WORD_BUILT_IN_STYLE_NAMES,
  fixedWordStyleName,
  isWordBuiltInStyleName,
} from './word-style-names.js';
export {
  ALIGNMENT_VALUES,
  PARAGRAPH_PROPERTIES,
  STYLE_PROPERTIES,
  TEXT_PROPERTIES,
  propertiesAt,
  propertyKeys,
  type NumberRange,
  type ParagraphProperty,
  type PropertyPlace,
  type PropertyType,
  type StyleProperty,
  type TextProperty,
} from './style-properties.js';
