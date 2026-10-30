/**
 * The messages between the extension host and the webview (ADR 0025). Both directions are plain
 * data. What the webview sends is untrusted, so the host checks it with `parseWebviewMessage`.
 */

/** Why the editor will not take a file, with the line (starting at 1) when there is one. */
export interface Reason {
  readonly message: string;
  readonly line?: number;
}

export type HostMessage =
  /** Starts the editor with a document, the stylesheet, and the IDs of the other documents. */
  | {
      readonly type: 'init';
      readonly documentText: string;
      readonly stylesheetText: string;
      readonly usedIds: readonly string[];
    }
  /** The document changed in another way, for example by Git or in the text editor. */
  | { readonly type: 'external-text'; readonly text: string }
  | { readonly type: 'stylesheet'; readonly text: string }
  | { readonly type: 'used-ids'; readonly ids: readonly string[] }
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
  | { readonly type: 'open-as-text' };

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

/** The message from the host, or undefined for anything else, such as a message of a page. */
export function parseHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'init': {
      const { documentText, stylesheetText, usedIds } = value;
      if (typeof documentText !== 'string' || typeof stylesheetText !== 'string') return undefined;
      if (!isStringList(usedIds)) return undefined;
      return { type: 'init', documentText, stylesheetText, usedIds };
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
