/**
 * The messages between the extension host and the webview (ADR 0025). Both directions are plain
 * data. What the webview sends is untrusted, so the host checks it with `parseWebviewMessage`.
 */

/** The defaults of a project (`ProjectDefaults` of core, which this file may not import). */
export interface Defaults {
  readonly classification?: string;
  readonly authors?: readonly string[];
  readonly pageTemplate?: string;
}

export interface MetadataField {
  readonly name: string;
  readonly type: 'string' | 'list';
  readonly required: boolean;
  readonly label?: string;
}

/** Why the editor will not take a file, with the line (starting at 1) when there is one. */
export interface Reason {
  readonly message: string;
  readonly line?: number;
}

/** The blocks of a document that use a style, by how (ADR 0052, 0054). */
export interface UsageCount {
  /** The document, relative to the project root. */
  readonly file: string;
  readonly direct: number;
  readonly default: number;
  readonly inherited: number;
}

/** What the checks of the project say about a block of this document (ADR 0057). */
export interface InlineDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  /** The path of the block, such as `blocks[2].items[0]`. */
  readonly path?: string;
  readonly nodeId?: string;
}

/** Where the styles of a project are used, by style name. A style that is not used is left out. */
export interface UsageSummary {
  /** The document of this editor, relative to the project root. */
  readonly current: string;
  readonly paragraph: Readonly<Record<string, readonly UsageCount[]>>;
  readonly character: Readonly<Record<string, readonly UsageCount[]>>;
  readonly table: Readonly<Record<string, readonly UsageCount[]>>;
}

export type HostMessage =
  /**
   * Starts the editor with a document, the stylesheet, the defaults of the project, which the
   * sheet needs for the values of the header and the cover, and the IDs of the other documents.
   */
  | {
      readonly type: 'init';
      readonly documentText: string;
      readonly stylesheetText: string;
      readonly defaults: Defaults;
      readonly usedIds: readonly string[];
      readonly projectReady: boolean;
      readonly fields?: readonly MetadataField[];
      readonly linkSchemes?: Readonly<Record<string, string>>;
    }
  | { readonly type: 'link-schemes'; readonly schemes: Readonly<Record<string, string>> }
  | { readonly type: 'metadata-fields'; readonly fields?: readonly MetadataField[] }
  | {
      readonly type: 'metadata-result';
      readonly ok: boolean;
      readonly message: string;
      readonly text: string;
    }
  | { readonly type: 'project-ready'; readonly usedIds: readonly string[] }
  /**
   * The document changed in another way, for example by Git or in the text editor. The blocks that
   * are new or different are marked unless `mark` is false, as for an undo or a redo (ADR 0062).
   */
  | { readonly type: 'external-text'; readonly text: string; readonly mark?: boolean }
  | { readonly type: 'stylesheet'; readonly text: string }
  | { readonly type: 'defaults'; readonly defaults: Defaults }
  | { readonly type: 'used-ids'; readonly ids: readonly string[] }
  /** Scroll to a top-level block of the document and put the cursor at its start. */
  | { readonly type: 'reveal'; readonly block: number }
  /** Open the list of headings for a reference, as the toolbar button does (ADR 0069). */
  | { readonly type: 'make-reference' }
  | { readonly type: 'navigation-finished' }
  /** Where the styles are used, sent after `init` and again when it changes. */
  | { readonly type: 'usage'; readonly usage: UsageSummary }
  /** What the checks say about this document, sent after `init` and again when it changes. */
  | { readonly type: 'diagnostics'; readonly diagnostics: readonly InlineDiagnostic[] }
  /**
   * The answer to `declare-variant`. On success the stylesheet message with the change came before
   * it, so the command that was refused can be tried again.
   */
  | { readonly type: 'declared'; readonly ok: boolean; readonly message: string }
  /** The file cannot be edited visually, and why. */
  | {
      readonly type: 'refused';
      readonly title: string;
      readonly reasons: readonly Reason[];
      /** Whether the file can be made canonical and then taken. */
      readonly canFormat: boolean;
    };

export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'startup-timing'; readonly visibleMs: number; readonly editableMs: number }
  /** The whole text of the document as the editor writes it. */
  | { readonly type: 'change'; readonly text: string }
  | { readonly type: 'metadata-change'; readonly before: string; readonly text: string }
  | { readonly type: 'open-project' }
  /** Follow an in-project reference to its target. */
  | { readonly type: 'follow-reference'; readonly target: string }
  | { readonly type: 'format' }
  /** The person editing allows a mark in a paragraph style (ADR 0026). The host checks both. */
  | { readonly type: 'declare-variant'; readonly style: string; readonly mark: string }
  /** Opens the style editor on the stylesheet of the project, at a style when one is given. */
  | {
      readonly type: 'edit-styles';
      readonly style?: { readonly kind: 'paragraph-style' | 'table-style'; readonly name: string };
    }
  | { readonly type: 'open-as-text' };

/** A style or mark name is short, whatever it is. */
const MAX_NAME_LENGTH = 200;

/** A document larger than this is not a document of this tool. */
export const MAX_TEXT_LENGTH = 20_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The message from the webview, or undefined for anything else. */
export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'ready':
    case 'format':
    case 'open-as-text':
    case 'open-project':
      return { type: value['type'] };
    case 'follow-reference': {
      const target = value['target'];
      return typeof target === 'string' &&
        target.length > 0 &&
        target.length <= MAX_NAME_LENGTH * 10
        ? { type: 'follow-reference', target }
        : undefined;
    }
    case 'edit-styles': {
      const style = value['style'];
      if (style === undefined) return { type: 'edit-styles' };
      if (!isRecord(style)) return undefined;
      const { kind, name } = style;
      if (kind !== 'paragraph-style' && kind !== 'table-style') return undefined;
      if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME_LENGTH) {
        return undefined;
      }
      return { type: 'edit-styles', style: { kind, name } };
    }
    case 'change': {
      const text = value['text'];
      if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) return undefined;
      return { type: 'change', text };
    }
    case 'metadata-change': {
      const { before, text } = value;
      if (typeof before !== 'string' || typeof text !== 'string') return undefined;
      if (before.length > MAX_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return undefined;
      return { type: 'metadata-change', before, text };
    }
    case 'startup-timing': {
      const { visibleMs, editableMs } = value;
      if (
        typeof visibleMs !== 'number' ||
        typeof editableMs !== 'number' ||
        !Number.isFinite(visibleMs) ||
        !Number.isFinite(editableMs) ||
        visibleMs < 0 ||
        editableMs < visibleMs
      )
        return undefined;
      return { type: 'startup-timing', visibleMs, editableMs };
    }
    case 'declare-variant': {
      const { style, mark } = value;
      if (typeof style !== 'string' || typeof mark !== 'string') return undefined;
      if (style.length > MAX_NAME_LENGTH || mark.length > MAX_NAME_LENGTH) return undefined;
      return { type: 'declare-variant', style, mark };
    }
    default:
      return undefined;
  }
}

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function isReason(value: unknown): value is Reason {
  return (
    isRecord(value) &&
    typeof value['message'] === 'string' &&
    (value['line'] === undefined || typeof value['line'] === 'number')
  );
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function parseUsageCounts(value: unknown): Record<string, UsageCount[]> | undefined {
  if (!isRecord(value)) return undefined;
  const counts: Record<string, UsageCount[]> = {};
  for (const [name, list] of Object.entries(value)) {
    if (!Array.isArray(list)) return undefined;
    const entries: UsageCount[] = [];
    for (const item of list as unknown[]) {
      if (!isRecord(item)) return undefined;
      const { file, direct, inherited } = item;
      const byDefault = item['default'];
      if (typeof file !== 'string' || !isCount(direct) || !isCount(inherited)) return undefined;
      if (!isCount(byDefault)) return undefined;
      entries.push({ file, direct, default: byDefault, inherited });
    }
    counts[name] = entries;
  }
  return counts;
}

/** Where the styles are used, or undefined when the value is not of that shape. */
function parseUsage(value: unknown): UsageSummary | undefined {
  if (!isRecord(value) || typeof value['current'] !== 'string') return undefined;
  const paragraph = parseUsageCounts(value['paragraph']);
  const character = parseUsageCounts(value['character']);
  const table = parseUsageCounts(value['table']);
  if (paragraph === undefined || character === undefined || table === undefined) return undefined;
  return { current: value['current'], paragraph, character, table };
}

function parseInlineDiagnostic(value: unknown): InlineDiagnostic | undefined {
  if (!isRecord(value)) return undefined;
  const { severity, code, message, path, nodeId } = value;
  if (severity !== 'error' && severity !== 'warning') return undefined;
  if (typeof code !== 'string' || typeof message !== 'string') return undefined;
  if (path !== undefined && typeof path !== 'string') return undefined;
  if (nodeId !== undefined && typeof nodeId !== 'string') return undefined;
  return {
    severity,
    code,
    message,
    ...(path !== undefined ? { path } : {}),
    ...(nodeId !== undefined ? { nodeId } : {}),
  };
}

/** The defaults of a project, or undefined when they are not of that shape. */
function parseDefaults(value: unknown): Defaults | undefined {
  if (!isRecord(value)) return undefined;
  const { classification, authors, pageTemplate } = value;
  if (classification !== undefined && typeof classification !== 'string') return undefined;
  if (authors !== undefined && !isStringList(authors)) return undefined;
  if (pageTemplate !== undefined && typeof pageTemplate !== 'string') return undefined;
  return {
    ...(classification !== undefined ? { classification } : {}),
    ...(authors !== undefined ? { authors } : {}),
    ...(pageTemplate !== undefined ? { pageTemplate } : {}),
  };
}

function parseMetadataFields(value: unknown): readonly MetadataField[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: MetadataField[] = [];
  const names = new Set<string>();
  for (const field of value as unknown[]) {
    if (!isRecord(field)) return undefined;
    const { name, type, required, label } = field;
    if (typeof name !== 'string' || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return undefined;
    if (names.has(name) || (type !== 'string' && type !== 'list')) return undefined;
    if (typeof required !== 'boolean' || (label !== undefined && typeof label !== 'string'))
      return undefined;
    names.add(name);
    result.push({ name, type, required, ...(label !== undefined ? { label } : {}) });
  }
  return result;
}

function parseLinkSchemes(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries: [string, string][] = [];
  for (const [name, template] of Object.entries(value)) {
    if (typeof template !== 'string') return undefined;
    entries.push([name, template]);
  }
  return Object.fromEntries(entries);
}

/** The message from the host, or undefined for anything else, such as a message of a page. */
export function parseHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'init': {
      const { documentText, stylesheetText, usedIds, projectReady } = value;
      if (typeof documentText !== 'string' || typeof stylesheetText !== 'string') return undefined;
      if (!isStringList(usedIds) || typeof projectReady !== 'boolean') return undefined;
      const defaults = parseDefaults(value['defaults']);
      if (defaults === undefined) return undefined;
      const fields = parseMetadataFields(value['fields']);
      if (value['fields'] !== undefined && fields === undefined) return undefined;
      const linkSchemes = parseLinkSchemes(value['linkSchemes']);
      if (value['linkSchemes'] !== undefined && linkSchemes === undefined) return undefined;
      return {
        type: 'init',
        documentText,
        stylesheetText,
        defaults,
        usedIds,
        projectReady,
        ...(fields !== undefined ? { fields } : {}),
        ...(linkSchemes !== undefined ? { linkSchemes } : {}),
      };
    }
    case 'link-schemes': {
      const schemes = parseLinkSchemes(value['schemes']);
      return schemes === undefined ? undefined : { type: 'link-schemes', schemes };
    }
    case 'metadata-fields': {
      const fields = parseMetadataFields(value['fields']);
      if (value['fields'] !== undefined && fields === undefined) return undefined;
      return { type: 'metadata-fields', ...(fields !== undefined ? { fields } : {}) };
    }
    case 'metadata-result': {
      const { ok, message, text } = value;
      return typeof ok === 'boolean' &&
        typeof message === 'string' &&
        typeof text === 'string' &&
        text.length <= MAX_TEXT_LENGTH
        ? { type: 'metadata-result', ok, message, text }
        : undefined;
    }
    case 'project-ready': {
      const usedIds = value['usedIds'];
      return isStringList(usedIds) ? { type: 'project-ready', usedIds } : undefined;
    }
    case 'defaults': {
      const defaults = parseDefaults(value['defaults']);
      return defaults === undefined ? undefined : { type: 'defaults', defaults };
    }
    case 'external-text': {
      const { text, mark } = value;
      if (typeof text !== 'string' || (mark !== undefined && typeof mark !== 'boolean')) {
        return undefined;
      }
      return { type: 'external-text', text, ...(mark !== undefined ? { mark } : {}) };
    }
    case 'stylesheet': {
      const text = value['text'];
      return typeof text === 'string' ? { type: value['type'], text } : undefined;
    }
    case 'used-ids': {
      const ids = value['ids'];
      return isStringList(ids) ? { type: 'used-ids', ids } : undefined;
    }
    case 'reveal': {
      const block = value['block'];
      return typeof block === 'number' && Number.isInteger(block) && block >= 0
        ? { type: 'reveal', block }
        : undefined;
    }
    case 'make-reference':
      return { type: 'make-reference' };
    case 'navigation-finished':
      return { type: 'navigation-finished' };
    case 'usage': {
      const usage = parseUsage(value['usage']);
      return usage === undefined ? undefined : { type: 'usage', usage };
    }
    case 'diagnostics': {
      const list = value['diagnostics'];
      if (!Array.isArray(list)) return undefined;
      const diagnostics: InlineDiagnostic[] = [];
      for (const item of list as unknown[]) {
        const parsed = parseInlineDiagnostic(item);
        if (parsed === undefined) return undefined;
        diagnostics.push(parsed);
      }
      return { type: 'diagnostics', diagnostics };
    }
    case 'declared': {
      const { ok, message } = value;
      if (typeof ok !== 'boolean' || typeof message !== 'string') return undefined;
      return { type: 'declared', ok, message };
    }
    case 'refused': {
      const { title, reasons, canFormat } = value;
      if (typeof title !== 'string' || typeof canFormat !== 'boolean') return undefined;
      if (!Array.isArray(reasons) || !reasons.every(isReason)) return undefined;
      return { type: 'refused', title, reasons, canFormat };
    }
    default:
      return undefined;
  }
}
