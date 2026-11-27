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

/**
 * A thread of a review document of the open document (ADR 0086), as the host read it back from the
 * layout of ADR 0084: what the editor needs to place it, and what a card shows.
 */
export interface ReviewThreadView {
  /** Unique among the threads sent: the review document and the heading of the thread. */
  readonly key: string;
  /** The review document, relative to the project root. */
  readonly review: string;
  readonly headingId?: string;
  readonly title: string;
  readonly anchor?: string;
  readonly position?:
    | { readonly kind: 'under' | 'after'; readonly paragraph: number }
    | { readonly kind: 'cell'; readonly row: number; readonly column: number };
  readonly quote?: { readonly start: string; readonly end?: string };
  readonly status: 'open' | 'resolved';
  /** The durable ID of the Word comment that starts the thread. */
  readonly wordComment?: string;
  readonly comments: readonly {
    readonly author: string;
    readonly time: string;
    readonly text: string;
    readonly reactions: readonly string[];
  }[];
  readonly notes: readonly string[];
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
  /**
   * The images of the covers and title blocks as data URLs, by their path in the project (ADR 0089,
   * ADR 0090), sent after `init` and again when they change.
   */
  | { readonly type: 'images'; readonly images: Readonly<Record<string, string>> }
  | { readonly type: 'defaults'; readonly defaults: Defaults }
  | { readonly type: 'used-ids'; readonly ids: readonly string[] }
  /** Scroll to a top-level block of the document and put the cursor at its start. */
  | { readonly type: 'reveal'; readonly block: number }
  /** Time each measured action this many times, without sending the changes (ADR 0101). */
  | { readonly type: 'measure-actions'; readonly runs: number }
  /** Open the list of headings for a reference, as the toolbar button does (ADR 0069). */
  | { readonly type: 'make-reference' }
  | { readonly type: 'navigation-finished' }
  /** Where the styles are used, sent after `init` and again when it changes. */
  | { readonly type: 'usage'; readonly usage: UsageSummary }
  /** What the checks say about this document, sent after `init` and again when it changes. */
  | { readonly type: 'diagnostics'; readonly diagnostics: readonly InlineDiagnostic[] }
  | { readonly type: 'review-threads'; readonly threads: readonly ReviewThreadView[] }
  /** A resolve or reopen of the thread is over, whether it was made or not. */
  | { readonly type: 'thread-status-done'; readonly key: string }
  /** Where the review round of the document stands (ADR 0088), sent again when that changes. */
  | {
      readonly type: 'review-round';
      readonly status: ReviewRoundView;
      /** The review folder, as the person reads it; absent when none is remembered. */
      readonly folder?: string;
    }
  /** A push or pull that the review buttons asked for is over, whether it was made or not. */
  | { readonly type: 'review-done' }
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
  /** The document was painted read-only or editable for the first time; the host takes the time (ADR 0101). */
  | {
      readonly type: 'painted';
      readonly stage: 'visible' | 'editable';
      /** With the first visible paint: the parts of the start of the webview, in order. */
      readonly steps?: readonly StartupStep[];
      /**
       * When it was painted, in milliseconds since 1970 on the clock of the machine. The host can be
       * too busy to read the message at once, so its arrival is not the time of the paint.
       */
      readonly at: number;
    }
  /** The durations of the measured actions, from the action to the paint after it (ADR 0101). */
  | {
      readonly type: 'action-timings';
      readonly timings: ActionTimings;
      /** For each action, in how many runs the editor had a transaction: 0 means it did nothing. */
      readonly applied: ActionCounts;
    }
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
  | { readonly type: 'open-as-text' }
  /** Opens the review document of a thread at its heading (ADR 0086). */
  | { readonly type: 'open-review'; readonly key: string }
  /** Resolves or reopens a thread in its review document (ADR 0086). */
  | {
      readonly type: 'set-thread-status';
      readonly key: string;
      readonly status: 'open' | 'resolved';
    }
  /** Push the document for review (ADR 0088): to the remembered folder, another, or as a new file. */
  | { readonly type: 'review-push'; readonly mode: 'remembered' | 'choose' | 'new' }
  /** Pull the comments from the file in the review folder (ADR 0088). */
  | { readonly type: 'review-pull' }
  /** Show the review folder in the system's file manager. */
  | { readonly type: 'open-review-folder' };

/** Where the review round of a document stands, as `reviewRoundStatus` in `project` gives it. */
export type ReviewRoundView =
  | { readonly kind: 'not-pushed' }
  | { readonly kind: 'not-this-document'; readonly message: string }
  | { readonly kind: 'unpulled'; readonly comments: number; readonly savedAt: string }
  | { readonly kind: 'changed' }
  | { readonly kind: 'current' };

function parseReviewRound(value: unknown): ReviewRoundView | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['kind']) {
    case 'not-pushed':
    case 'changed':
    case 'current':
      return { kind: value['kind'] };
    case 'not-this-document': {
      const message = value['message'];
      return typeof message === 'string' ? { kind: 'not-this-document', message } : undefined;
    }
    case 'unpulled': {
      const { comments, savedAt } = value;
      return typeof comments === 'number' &&
        Number.isInteger(comments) &&
        comments >= 0 &&
        typeof savedAt === 'string'
        ? { kind: 'unpulled', comments, savedAt }
        : undefined;
    }
    default:
      return undefined;
  }
}

/** A style or mark name is short, whatever it is. */
const MAX_NAME_LENGTH = 200;

/** A document larger than this is not a document of this tool. */
export const MAX_TEXT_LENGTH = 20_000_000;

/** A PNG or JPEG as a data URL, which the policy of the webview allows as an image. */
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/;

/** Images by path, each a data URL of a PNG or JPEG; undefined for anything else. */
export function parseImages(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const images: Record<string, string> = {};
  let length = 0;
  for (const [path, url] of Object.entries(value)) {
    if (typeof url !== 'string' || !IMAGE_DATA_URL.test(url)) return undefined;
    length += url.length;
    images[path] = url;
  }
  return length <= MAX_TEXT_LENGTH ? images : undefined;
}

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
    case 'review-pull':
    case 'open-review-folder':
      return { type: value['type'] };
    case 'review-push': {
      const mode = value['mode'];
      return mode === 'remembered' || mode === 'choose' || mode === 'new'
        ? { type: 'review-push', mode }
        : undefined;
    }
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
    case 'painted': {
      const { stage, at } = value;
      if (stage !== 'visible' && stage !== 'editable') return undefined;
      if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return undefined;
      if (value['steps'] === undefined) return { type: 'painted', stage, at };
      const steps = parseSteps(value['steps']);
      return steps === undefined ? undefined : { type: 'painted', stage, at, steps };
    }
    case 'action-timings': {
      const timings = parseActionTimings(value['timings']);
      const applied = parseActionCounts(value['applied']);
      return timings === undefined || applied === undefined
        ? undefined
        : { type: 'action-timings', timings, applied };
    }
    case 'open-review': {
      const key = value['key'];
      return typeof key === 'string' && key.length > 0 && key.length <= MAX_NAME_LENGTH * 10
        ? { type: 'open-review', key }
        : undefined;
    }
    case 'set-thread-status': {
      const { key, status } = value;
      if (typeof key !== 'string' || key.length === 0 || key.length > MAX_NAME_LENGTH * 10) {
        return undefined;
      }
      return status === 'open' || status === 'resolved'
        ? { type: 'set-thread-status', key, status }
        : undefined;
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

/** The actions that the measurement of ADR 0101 times. */
export const MEASURED_ACTIONS = ['type', 'enter', 'style', 'strong'] as const;
export type MeasuredAction = (typeof MEASURED_ACTIONS)[number];
export type ActionTimings = Readonly<Record<MeasuredAction, readonly number[]>>;
export type ActionCounts = Readonly<Record<MeasuredAction, number>>;

/** A part of the start of the webview and how long it took, in milliseconds (ADR 0101). */
export interface StartupStep {
  readonly name: string;
  readonly ms: number;
}

const MAX_STARTUP_STEPS = 50;

function parseSteps(value: unknown): readonly StartupStep[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_STARTUP_STEPS) return undefined;
  const steps: StartupStep[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const { name, ms } = item;
    if (typeof name !== 'string' || name.length > 100) return undefined;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return undefined;
    steps.push({ name, ms });
  }
  return steps;
}

function parseActionCounts(value: unknown): ActionCounts | undefined {
  if (!isRecord(value)) return undefined;
  const counts: Partial<Record<MeasuredAction, number>> = {};
  for (const action of MEASURED_ACTIONS) {
    const count = value[action];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined;
    counts[action] = count;
  }
  return counts as ActionCounts;
}

const MAX_MEASURE_RUNS = 1000;

function parseActionTimings(value: unknown): ActionTimings | undefined {
  if (!isRecord(value)) return undefined;
  const timings: Partial<Record<MeasuredAction, readonly number[]>> = {};
  for (const action of MEASURED_ACTIONS) {
    const list = value[action];
    if (
      !Array.isArray(list) ||
      list.length > MAX_MEASURE_RUNS ||
      !list.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    )
      return undefined;
    timings[action] = list as number[];
  }
  return timings as ActionTimings;
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

const isString = (value: unknown): value is string => typeof value === 'string';
const isStrings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isString);
const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function parsePosition(value: unknown): ReviewThreadView['position'] | 'invalid' {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return 'invalid';
  const { kind, paragraph, row, column } = value;
  if ((kind === 'under' || kind === 'after') && isPositive(paragraph)) return { kind, paragraph };
  if (kind === 'cell' && isPositive(row) && isPositive(column)) return { kind, row, column };
  return 'invalid';
}

/** A thread as the host sent it, or undefined when it is not one. */
export function parseReviewThread(value: unknown): ReviewThreadView | undefined {
  if (!isRecord(value)) return undefined;
  const { key, review, headingId, title, anchor, quote, status, comments, notes, wordComment } =
    value;
  if (wordComment !== undefined && !isString(wordComment)) return undefined;
  if (!isString(key) || !isString(review) || !isString(title)) return undefined;
  if (status !== 'open' && status !== 'resolved') return undefined;
  if (headingId !== undefined && !isString(headingId)) return undefined;
  if (anchor !== undefined && !isString(anchor)) return undefined;
  const position = parsePosition(value['position']);
  if (position === 'invalid') return undefined;
  if (quote !== undefined) {
    if (!isRecord(quote) || !isString(quote['start'])) return undefined;
    if (quote['end'] !== undefined && !isString(quote['end'])) return undefined;
  }
  if (!Array.isArray(comments) || !isStrings(notes)) return undefined;
  const read = comments.map((c: unknown) =>
    isRecord(c) &&
    isString(c['author']) &&
    isString(c['time']) &&
    isString(c['text']) &&
    isStrings(c['reactions'])
      ? { author: c['author'], time: c['time'], text: c['text'], reactions: c['reactions'] }
      : undefined,
  );
  if (read.some((c) => c === undefined)) return undefined;
  return {
    key,
    review,
    ...(headingId !== undefined ? { headingId } : {}),
    title,
    ...(anchor !== undefined ? { anchor } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(isRecord(quote) && isString(quote['start'])
      ? {
          quote: {
            start: quote['start'],
            ...(isString(quote['end']) ? { end: quote['end'] } : {}),
          },
        }
      : {}),
    status,
    ...(wordComment !== undefined ? { wordComment } : {}),
    comments: read.filter((c) => c !== undefined),
    notes,
  };
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
    case 'images': {
      const images = parseImages(value['images']);
      return images === undefined ? undefined : { type: 'images', images };
    }
    case 'used-ids': {
      const ids = value['ids'];
      return isStringList(ids) ? { type: 'used-ids', ids } : undefined;
    }
    case 'measure-actions': {
      const runs = value['runs'];
      return typeof runs === 'number' &&
        Number.isInteger(runs) &&
        runs > 0 &&
        runs <= MAX_MEASURE_RUNS
        ? { type: 'measure-actions', runs }
        : undefined;
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
    case 'review-threads': {
      const list = value['threads'];
      if (!Array.isArray(list)) return undefined;
      const threads = list.map(parseReviewThread);
      return threads.some((t) => t === undefined)
        ? undefined
        : { type: 'review-threads', threads: threads.filter((t) => t !== undefined) };
    }
    case 'thread-status-done': {
      const key = value['key'];
      return typeof key === 'string' ? { type: 'thread-status-done', key } : undefined;
    }
    case 'review-round': {
      const status = parseReviewRound(value['status']);
      const folder = value['folder'];
      if (status === undefined || (folder !== undefined && typeof folder !== 'string')) {
        return undefined;
      }
      return { type: 'review-round', status, ...(folder !== undefined ? { folder } : {}) };
    }
    case 'review-done':
      return { type: 'review-done' };
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
