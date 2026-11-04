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

/** Why the editor will not take a file, with the line (starting at 1) when there is one. */
export interface Reason {
  readonly message: string;
  readonly line?: number;
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
    }
  /** The document changed in another way, for example by Git or in the text editor. */
  | { readonly type: 'external-text'; readonly text: string }
  | { readonly type: 'stylesheet'; readonly text: string }
  | { readonly type: 'defaults'; readonly defaults: Defaults }
  | { readonly type: 'used-ids'; readonly ids: readonly string[] }
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
  /** The whole text of the document as the editor writes it. */
  | { readonly type: 'change'; readonly text: string }
  | { readonly type: 'format' }
  /** The person editing allows a mark in a paragraph style (ADR 0026). The host checks both. */
  | { readonly type: 'declare-variant'; readonly style: string; readonly mark: string }
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
      return { type: value['type'] };
    case 'change': {
      const text = value['text'];
      if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) return undefined;
      return { type: 'change', text };
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

/** The message from the host, or undefined for anything else, such as a message of a page. */
export function parseHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'init': {
      const { documentText, stylesheetText, usedIds } = value;
      if (typeof documentText !== 'string' || typeof stylesheetText !== 'string') return undefined;
      if (!isStringList(usedIds)) return undefined;
      const defaults = parseDefaults(value['defaults']);
      if (defaults === undefined) return undefined;
      return { type: 'init', documentText, stylesheetText, defaults, usedIds };
    }
    case 'defaults': {
      const defaults = parseDefaults(value['defaults']);
      return defaults === undefined ? undefined : { type: 'defaults', defaults };
    }
    case 'external-text':
    case 'stylesheet': {
      const text = value['text'];
      return typeof text === 'string' ? { type: value['type'], text } : undefined;
    }
    case 'used-ids': {
      const ids = value['ids'];
      return isStringList(ids) ? { type: 'used-ids', ids } : undefined;
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
