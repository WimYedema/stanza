export { isNodeId, nodeIdFromRandomBytes, type NodeId } from './ids.js';
export { assignMissingIds, type AssignIdsOptions, type AssignIdsResult } from './assign-ids.js';
export { isStyleName, type StyleName } from './style-name.js';
export type { Diagnostic, Severity } from './diagnostic.js';
export type {
  Block,
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
  PhraseBlock,
  StrongMark,
  StyleMark,
  Table,
  TableCell,
  Text,
} from './document.js';
export { normalizeDocument, normalizeInlines } from './normalize.js';
