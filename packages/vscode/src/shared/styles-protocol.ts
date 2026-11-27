import { parseImages, type Reason } from './protocol.js';

/**
 * The messages between the extension host and the webview of the style editor (ADR 0036). Both
 * directions are plain data, and what the webview sends is untrusted, so the host checks it.
 */

export type StylesHostMessage =
  /** Starts the editor with the text of the stylesheet. */
  | { readonly type: 'init'; readonly text: string }
  /** The stylesheet changed, in the editor of its text or on disk. */
  | { readonly type: 'text'; readonly text: string }
  /** A change that the webview asked for was not made, and why. */
  | { readonly type: 'edit-refused'; readonly message: string }
  /** Selects a style, such as the one that the person was looking at in a document. */
  | { readonly type: 'select-style'; readonly kind: StyleKind; readonly name: string }
  /** The page layout of the document the editor was opened from, and its file name (ADR 0096). */
  | { readonly type: 'document-layout'; readonly name: string; readonly document: string }
  /** The file is not the stylesheet of a project, and why. */
  | { readonly type: 'refused'; readonly title: string; readonly reasons: readonly Reason[] }
  /**
   * The PNG and JPEG files of the project as data URLs, by path, to choose an image of a cover or a
   * title block and to show it in the preview (ADR 0091).
   */
  | { readonly type: 'images'; readonly images: Readonly<Record<string, string>> };

/** A value that can be written on one line in a stylesheet (`YamlValue` of the format package). */
export type Value =
  string | number | boolean | readonly string[] | { readonly [key: string]: Value };

export type StylesWebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'open-as-text' }
  /** Sets the property at a path of the stylesheet, such as `paragraph-styles`, `body`, `size`. */
  | { readonly type: 'set'; readonly path: readonly string[]; readonly value: Value }
  | { readonly type: 'unset'; readonly path: readonly string[] }
  /**
   * Writes the value at a path as a block of YAML lines, or removes it for null: the cover or the
   * title block of a page template, written by the panel as a whole (ADR 0091).
   */
  | { readonly type: 'set-block'; readonly path: readonly string[]; readonly source: string | null }
  /** Adds an empty style, based on another of its kind or on none (ADR 0053). */
  | {
      readonly type: 'add-style';
      readonly kind: StyleKind;
      readonly name: string;
      readonly basedOn?: string;
    }
  /** Deletes a style, if nothing uses it and nothing refers to it (ADR 0053). */
  | { readonly type: 'delete-style'; readonly kind: StyleKind; readonly name: string };

export type StyleKind = 'paragraph-style' | 'character-style' | 'table-style';

const STYLE_KINDS: readonly unknown[] = ['paragraph-style', 'character-style', 'table-style'];

const isStyleKind = (value: unknown): value is StyleKind => STYLE_KINDS.includes(value);

const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a path or a value of a message may be, whatever the page sends. */
const MAX_PATH_LENGTH = 8;
const MAX_TEXT_LENGTH = 500;
const MAX_ITEMS = 20;
const MAX_DEPTH = 3;
/** A cover written out is longer than a value, but not by much. */
const MAX_BLOCK_LENGTH = 100_000;

function isPath(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    value.every((key) => typeof key === 'string' && key.length > 0 && key.length <= 200)
  );
}

function isValue(value: unknown, depth = 0): value is Value {
  if (typeof value === 'string') return value.length <= MAX_TEXT_LENGTH;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_ITEMS &&
      value.every((item) => typeof item === 'string' && item.length <= MAX_TEXT_LENGTH)
    );
  }
  if (!isRecord(value) || depth >= MAX_DEPTH) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_ITEMS && entries.every(([, inner]) => isValue(inner, depth + 1));
}

/** The message from the webview, or undefined for anything else. */
export function parseStylesWebviewMessage(value: unknown): StylesWebviewMessage | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'ready':
    case 'open-as-text':
      return { type: value['type'] };
    case 'set': {
      const { path, value: inner } = value;
      return isPath(path) && isValue(inner) ? { type: 'set', path, value: inner } : undefined;
    }
    case 'unset':
      return isPath(value['path']) ? { type: 'unset', path: value['path'] } : undefined;
    case 'set-block': {
      const { path, source } = value;
      if (!isPath(path)) return undefined;
      if (source === null) return { type: 'set-block', path, source };
      return typeof source === 'string' && source.length <= MAX_BLOCK_LENGTH
        ? { type: 'set-block', path, source }
        : undefined;
    }
    case 'add-style': {
      const { kind, name, basedOn } = value;
      if (!isStyleKind(kind) || !isName(name)) return undefined;
      if (basedOn === undefined) return { type: 'add-style', kind, name };
      return isName(basedOn) ? { type: 'add-style', kind, name, basedOn } : undefined;
    }
    case 'delete-style': {
      const { kind, name } = value;
      return isStyleKind(kind) && isName(name) ? { type: 'delete-style', kind, name } : undefined;
    }
    default:
      return undefined;
  }
}

function isReason(value: unknown): value is Reason {
  return (
    isRecord(value) &&
    typeof value['message'] === 'string' &&
    (value['line'] === undefined || typeof value['line'] === 'number')
  );
}

/** The message from the host, or undefined for anything else, such as a message of a page. */
export function parseStylesHostMessage(value: unknown): StylesHostMessage | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'init':
    case 'text': {
      const text = value['text'];
      return typeof text === 'string' ? { type: value['type'], text } : undefined;
    }
    case 'refused': {
      const { title, reasons } = value;
      if (typeof title !== 'string' || !Array.isArray(reasons) || !reasons.every(isReason)) {
        return undefined;
      }
      return { type: 'refused', title, reasons };
    }
    case 'edit-refused': {
      const message = value['message'];
      return typeof message === 'string' ? { type: 'edit-refused', message } : undefined;
    }
    case 'select-style': {
      const { kind, name } = value;
      return isStyleKind(kind) && isName(name) ? { type: 'select-style', kind, name } : undefined;
    }
    case 'document-layout': {
      const { name, document } = value;
      return isName(name) && typeof document === 'string'
        ? { type: 'document-layout', name, document }
        : undefined;
    }
    case 'images': {
      const images = parseImages(value['images']);
      return images === undefined ? undefined : { type: 'images', images };
    }
    default:
      return undefined;
  }
}
