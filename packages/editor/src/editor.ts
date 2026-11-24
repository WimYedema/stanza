import { Editor, Extension, getMarkAttributes, type Extensions } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { Node as EditorNode } from '@tiptap/pm/model';
import {
  nodeIdFromRandomBytes,
  type Diagnostic,
  type Document,
  type DocumentMeta,
  type Stylesheet,
  type LinkSchemes,
} from '@stanza/core';
import { SCOPE_CLASS, compileStylesheetToCss } from '@stanza/css';
import {
  Annotations,
  DIAGNOSTIC_CLASS,
  HEADING_NUMBER_CLASS,
  REFRESH_ANNOTATIONS,
  annotationsKey,
} from './annotations.js';
import { BlockIds, type IdSource } from './block-ids.js';
import {
  CHANGED_CLASS,
  ChangeMarks,
  blockStarts,
  diffBlocks,
  markBlocks,
  markedBlocks,
} from './change-marks.js';
import { checkCommand, runCommand, type CommandResult, type EditorCommand } from './commands.js';
import { editorContext, type EditorContext } from './context.js';
import { ContextClasses, REFRESH_CLASSES, contextClassesKey } from './context-classes.js';
import { fromEditorContent, toEditorContent, type FromEditorResult } from './convert.js';
import { GapCursor } from './gap-cursor.js';
import { StanzaKeys } from './keys.js';
import type { Notice } from './notice.js';
import { StanzaPaste } from './paste.js';
import { ReferenceTrigger } from './reference-trigger.js';
import {
  StanzaBlockView,
  STANZA_BLOCK_EMPTY_CLASS,
  STANZA_BLOCK_LABEL_CLASS,
} from './stanza-block-view.js';
import {
  changeEnd,
  editorPosition,
  moveTo,
  moveToPosition,
  type EditorPosition,
} from './position.js';
import { STANZA_BLOCK_CLASS, schemaExtensions } from './schema.js';
import {
  ReviewHighlights,
  anchorPosition,
  highlightThreads,
  highlightedThreads,
  placeThread,
  selectThread,
  type Placement,
  type ThreadPlace,
} from './review-threads.js';

/** Where a review thread is in the text of the editor. */
export interface PlacedThread {
  readonly key: string;
  readonly placement: Placement;
}

/** Where the text of a thread is on the screen now, in the coordinates of the window. */
export interface ThreadBox {
  readonly key: string;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * What the editor needs beyond the generated stylesheet: the look of its own parts, which are not
 * part of the document.
 */
export const EDITOR_CHROME_CSS = `.${SCOPE_CLASS} {
  outline: none;
  box-sizing: border-box;
}

.${SCOPE_CLASS} li > p:not([class]) {
  margin: 0;
}

.${SCOPE_CLASS} .${STANZA_BLOCK_CLASS} {
  margin: 6pt 0;
  padding: 4pt 8pt;
  border: 1px dashed #999999;
  color: #555555;
  font: 10pt sans-serif;
  user-select: none;
}

.${SCOPE_CLASS} .${STANZA_BLOCK_LABEL_CLASS} {
  margin-bottom: 4pt;
  color: #777777;
  font: 9pt sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.${SCOPE_CLASS} .${STANZA_BLOCK_EMPTY_CLASS} {
  color: #888888;
  font: italic 10pt sans-serif;
}

.${SCOPE_CLASS} .${HEADING_NUMBER_CLASS} {
  margin-right: 0.6em;
  user-select: none;
  opacity: 0.7;
}

.${SCOPE_CLASS} .${DIAGNOSTIC_CLASS}-error {
  box-shadow: -8px 0 0 #f14c4c;
}

.${SCOPE_CLASS} .${DIAGNOSTIC_CLASS}-warning {
  box-shadow: -8px 0 0 #cca700;
}

.${SCOPE_CLASS} .${CHANGED_CLASS} {
  background-color: #e8f1ff;
}

.${SCOPE_CLASS} .selectedCell {
  background-color: #C8DCFF;
}

.${SCOPE_CLASS} .ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
}

.${SCOPE_CLASS} .ProseMirror-gapcursor::after {
  content: '';
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid currentColor;
  animation: stanza-gapcursor-blink 1.1s steps(2, start) infinite;
}

@keyframes stanza-gapcursor-blink {
  to {
    visibility: hidden;
  }
}

.${SCOPE_CLASS}.ProseMirror-focused .ProseMirror-gapcursor {
  display: block;
}
`;

export interface StanzaEditorOptions {
  readonly linkSchemes?: LinkSchemes;
  /** The element that the editor is put in. */
  readonly element: HTMLElement;
  /** A stylesheet without errors. */
  readonly stylesheet: Stylesheet;
  readonly document: Document;
  /** Called after every change made in the editor, with what the editor now holds. */
  readonly onChange?: (result: FromEditorResult) => void;
  /** Called with things the person editing should hear: a refused key, content dropped on paste. */
  readonly onNotice?: (notice: Notice) => void;
  /** Called after any transaction: a move of the cursor, a change, or a new stylesheet. */
  readonly onContextChange?: () => void;
  /** A candidate for the ID of a new block. Random by default. */
  readonly newId?: () => string;
  /** The IDs of the other documents of the project, which new IDs must avoid. */
  readonly usedIds?: () => ReadonlySet<string>;
  /** The nonce of a content security policy, written on the style elements that the editor adds. */
  readonly styleNonce?: string;
  /** False for a view that only shows the content, such as a sample of a stylesheet. */
  readonly editable?: boolean;
  /** Called after an `@` was typed where a reference can start, to offer the headings (ADR 0071). */
  readonly onReferenceTrigger?: () => void;
}

/** What a replacement of the content changed, as far as it was asked to find out (ADR 0062). */
export interface DocumentChange {
  /** Blocks of the new content that are new or different. */
  readonly changed: number;
  /** Blocks of the old content that are not in the new. */
  readonly removed: number;
}

export interface StanzaEditor {
  /** Refreshes link destinations and command/paste policy without changing source or selection. */
  setLinkSchemes(schemes: LinkSchemes): void;
  /** Read-only previews cannot run editing commands or change the document through input. */
  setEditable(editable: boolean): void;
  /** The document the editor holds, with the metadata it was given. */
  getDocument(): FromEditorResult;
  /** Receives host-accepted metadata without changing content or selection, or calling onChange. */
  setMetadata(meta: DocumentMeta): void;
  /**
   * Replaces the content, for example after the file changed on disk. Does not call `onChange`. With
   * `cursor: 'at-change'` the cursor goes to where the content changed, as after an undo or a redo,
   * and stays where it was when nothing changed. With `markChanges` the blocks that are new or
   * different are marked (ADR 0062); marks that are there already stay on the blocks that stay.
   */
  setDocument(
    document: Document,
    options?: { readonly cursor?: 'at-change'; readonly markChanges?: boolean },
  ): DocumentChange;
  /** The numbers of the top-level blocks that are marked as changed from outside, in order. */
  changedBlocks(): readonly number[];
  /** Takes all the marks of changes from outside off. */
  clearChanges(): void;
  /** Applies a new stylesheet. With errors it changes nothing and returns them. */
  setStylesheet(stylesheet: Stylesheet): readonly Diagnostic[];
  /**
   * Marks the blocks that diagnostics are about, by their ID or by the top-level block of their
   * path, with the messages as a tooltip (ADR 0057). Replaces the diagnostics shown before.
   */
  setDiagnostics(diagnostics: readonly Diagnostic[]): void;
  /**
   * Places the threads of the review documents in the text and highlights their ranges (ADR 0086),
   * in place of the ones before, and gives where each one is. They are placed again when the
   * document is replaced; while editing, the highlights move with the text.
   */
  setReviewThreads(threads: readonly ThreadPlace[]): readonly PlacedThread[];
  /**
   * Where the text of each placed thread is now, in the order of the document: the start of its
   * range, as it moved while editing, or else its block. An orphaned thread has none.
   */
  reviewThreadBoxes(): readonly ThreadBox[];
  /** Marks the range of one thread as selected, or none, and gives its box to scroll to. */
  selectReviewThread(key: string | undefined): ThreadBox | undefined;
  /** Does what a command says, or refuses it and changes nothing (ADR 0023). */
  run(command: EditorCommand): CommandResult;
  /** What `run` would answer, with nothing changed. A refusal can carry a fix (ADR 0026). */
  check(command: EditorCommand): CommandResult;
  /** The state at the selection: block, styles, and marks that are on and allowed. */
  getContext(): EditorContext;
  /** Where the cursor is, to put it back after `setDocument`. */
  getPosition(): EditorPosition;
  /** Puts the cursor at a position, or as near to it as the document allows. */
  setPosition(position: EditorPosition): void;
  /** What the selection covers, as plain text; empty when nothing is selected. */
  getSelectedText(): string;
  /** Where the link at the cursor or in the selection goes, or nothing when there is none. */
  getLinkHref(): string | undefined;
  /** Puts the focus back in the content, as after a list that was chosen from. */
  focus(): void;
  /** The element drawn for a top-level block, to scroll to it. */
  blockElement(block: number): HTMLElement | undefined;
  destroy(): void;
}

function compile(stylesheet: Stylesheet): { css: string; diagnostics: readonly Diagnostic[] } {
  const { css, diagnostics } = compileStylesheetToCss(stylesheet);
  return { css: css === undefined ? '' : `${EDITOR_CHROME_CSS}\n${css}`, diagnostics };
}

/** Random IDs from the Web Crypto API, and no knowledge of other documents. */
const randomIds: IdSource = {
  newId: () => nodeIdFromRandomBytes(crypto.getRandomValues(new Uint8Array(10))),
  usedIds: () => new Set<string>(),
};

/** The extensions of the editor, for the stylesheet in force and the way to give notices. */
export function stanzaExtensions(
  stylesheet: () => Stylesheet,
  notice: (notice: Notice) => void,
  ids: IdSource = randomIds,
  referenceTrigger?: () => void,
  schemes: () => LinkSchemes = () => ({}),
): Extensions {
  return [
    ...schemaExtensions(schemes),
    GapCursor,
    Annotations.configure({ stylesheet }),
    ChangeMarks,
    ReviewHighlights,
    BlockIds.configure({ ...ids, notice }),
    ContextClasses.configure({ stylesheet }),
    StanzaBlockView.configure({ stylesheet }),
    StanzaKeys.configure({ stylesheet, notice }),
    StanzaPaste.configure({ stylesheet, notice, schemes }),
    ReferenceTrigger.configure({ trigger: referenceTrigger }),
  ];
}

/** Starts an editor for a document and stylesheet (ADR 0022). */
export function createStanzaEditor(options: StanzaEditorOptions): StanzaEditor {
  let threads: readonly ThreadPlace[] = [];
  let stylesheet = options.stylesheet;
  let linkSchemes = options.linkSchemes ?? {};
  let meta = options.document.meta;
  let editable = options.editable ?? true;
  let replacing = false;
  const first = compile(stylesheet);
  if (first.css === '') {
    const reasons = first.diagnostics.map((d) => d.message).join(' ');
    throw new Error(`The stylesheet has errors. ${reasons}`);
  }

  const style = options.element.ownerDocument.createElement('style');
  if (options.styleNonce !== undefined) style.setAttribute('nonce', options.styleNonce);
  style.textContent = first.css;
  options.element.prepend(style);

  const editor = new Editor({
    element: options.element,
    extensions: [
      ...stanzaExtensions(
        () => stylesheet,
        (notice) => options.onNotice?.(notice),
        {
          newId: options.newId ?? randomIds.newId,
          usedIds: options.usedIds ?? randomIds.usedIds,
        },
        options.onReferenceTrigger,
        () => linkSchemes,
      ),
      Extension.create({
        name: 'stanzaEditingGate',
        addProseMirrorPlugins: () => [
          new Plugin({
            filterTransaction: (transaction) => !transaction.docChanged || editable || replacing,
          }),
        ],
      }),
    ],
    content: toEditorContent(options.document),
    editable: options.editable ?? true,
    editorProps: { attributes: { class: SCOPE_CLASS } },
    ...(options.styleNonce !== undefined ? { injectNonce: options.styleNonce } : {}),
    onUpdate: ({ editor: current }) => {
      options.onChange?.(fromEditorContent(current.state.doc, meta));
    },
    onTransaction: () => {
      options.onContextChange?.();
    },
  });

  /** Places the review threads in the current text and highlights the ranges found (ADR 0086). */
  let placed: readonly PlacedThread[] = [];
  const placeThreads = (): readonly PlacedThread[] => {
    placed = threads.map((thread) => ({
      key: thread.key,
      placement: placeThread(editor.state.doc, thread),
    }));
    const ranges = placed.flatMap(({ key, placement }) => {
      if (placement.kind !== 'range') return [];
      const label = threads.find((t) => t.key === key)?.label;
      return [
        { key, from: placement.from, to: placement.to, ...(label !== undefined ? { label } : {}) },
      ];
    });
    editor.view.dispatch(highlightThreads(editor.state, ranges));
    return placed;
  };

  /** The position of the text of each placed thread now, in the order of the document. */
  const threadPositions = (): { key: string; pos: number; block: boolean }[] => {
    const { doc } = editor.state;
    const ranges = new Map(highlightedThreads(editor.state).map((r) => [r.key, r.from]));
    const found: { key: string; pos: number; block: boolean }[] = [];
    for (const { key, placement } of placed) {
      if (placement.kind === 'orphan') continue;
      const from = placement.kind === 'range' ? ranges.get(key) : undefined;
      if (from !== undefined) {
        found.push({ key, pos: from, block: false });
        continue;
      }
      const anchor = threads.find((t) => t.key === key)?.anchor;
      const pos = anchorPosition(doc, anchor);
      if (pos !== undefined) found.push({ key, pos, block: true });
    }
    return found.sort((a, b) => a.pos - b.pos);
  };

  const boxOf = (key: string, pos: number, block: boolean): ThreadBox | undefined => {
    try {
      const dom = block ? editor.view.nodeDOM(pos) : null;
      if (dom instanceof HTMLElement) {
        const rect = dom.getBoundingClientRect();
        return { key, top: rect.top, bottom: rect.bottom, left: rect.left };
      }
      const coords = editor.view.coordsAtPos(block ? pos + 1 : pos, 1);
      return { key, top: coords.top, bottom: coords.bottom, left: coords.left };
    } catch {
      // A view without layout, as in a test, has no coordinates.
      return undefined;
    }
  };

  /** Marks the blocks that differ from the content before, and keeps the marks of blocks that stayed. */
  const markDifferences = (
    before: EditorNode,
    oldMarked: ReadonlySet<number>,
    mark: boolean,
  ): DocumentChange => {
    if (!mark && oldMarked.size === 0) return { changed: 0, removed: 0 };
    const { kept, removed } = diffBlocks(before, editor.state.doc);
    const marked = blockStarts(editor.state.doc).filter((_, index) => {
      const old = kept[index] ?? -1;
      return old < 0 ? mark : oldMarked.has(old);
    });
    editor.view.dispatch(markBlocks(editor.state, marked));
    return mark
      ? { changed: kept.filter((old) => old < 0).length, removed }
      : { changed: 0, removed: 0 };
  };

  return {
    setLinkSchemes(value) {
      linkSchemes = value;
      editor.view.dispatch(editor.state.tr.setMeta('link-schemes', true));
    },
    setEditable(value) {
      editable = value;
      editor.setEditable(value, false);
    },
    getDocument: () => fromEditorContent(editor.state.doc, meta),
    setMetadata(value) {
      meta = value;
    },
    setDocument(document, options) {
      meta = document.meta;
      const before = editor.state.doc;
      const oldMarked = new Set(markedBlocks(editor.state));
      const position = editorPosition(editor.state);
      replacing = true;
      try {
        editor.commands.setContent(toEditorContent(document), { emitUpdate: false });
      } finally {
        replacing = false;
      }
      const change = markDifferences(before, oldMarked, options?.markChanges === true);
      if (threads.length > 0) placeThreads();
      if (options?.cursor !== 'at-change') return change;
      const end = changeEnd(before, editor.state.doc);
      editor.view.dispatch(
        end === undefined ? moveTo(editor.state, position) : moveToPosition(editor.state, end),
      );
      return change;
    },
    changedBlocks: () => markedBlocks(editor.state),
    clearChanges() {
      editor.view.dispatch(markBlocks(editor.state, []));
    },
    setStylesheet(next) {
      const compiled = compile(next);
      if (compiled.css === '') return compiled.diagnostics;
      stylesheet = next;
      style.textContent = compiled.css;
      editor.view.dispatch(
        editor.state.tr
          .setMeta(contextClassesKey, REFRESH_CLASSES)
          .setMeta(annotationsKey, REFRESH_ANNOTATIONS),
      );
      return compiled.diagnostics;
    },
    setDiagnostics(diagnostics) {
      editor.view.dispatch(editor.state.tr.setMeta(annotationsKey, { diagnostics }));
    },
    setReviewThreads(next) {
      threads = next;
      return placeThreads();
    },
    reviewThreadBoxes: () =>
      threadPositions().flatMap(({ key, pos, block }) => boxOf(key, pos, block) ?? []),
    selectReviewThread(key) {
      editor.view.dispatch(selectThread(editor.state, key));
      const found = threadPositions().find((t) => t.key === key);
      return found === undefined ? undefined : boxOf(found.key, found.pos, found.block);
    },
    destroy() {
      editor.destroy();
      style.remove();
    },
    getPosition: () => editorPosition(editor.state),
    getSelectedText() {
      const { from, to, empty } = editor.state.selection;
      return empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    },
    getLinkHref() {
      const href: unknown = getMarkAttributes(editor.state, 'link')['href'];
      return typeof href === 'string' ? href : undefined;
    },
    focus() {
      editor.view.focus();
    },
    setPosition(position) {
      editor.view.dispatch(moveTo(editor.state, position));
    },
    blockElement(block) {
      const { doc } = editor.state;
      if (block < 0 || block >= doc.childCount) return undefined;
      let start = 0;
      for (let child = 0; child < block; child += 1) start += doc.child(child).nodeSize;
      const dom = editor.view.nodeDOM(start);
      return dom instanceof HTMLElement ? dom : undefined;
    },
    run: (command) =>
      !editable
        ? { ok: false, reason: 'not-applicable', message: 'This document is read-only.' }
        : runCommand(
            editor.state,
            (tr) => {
              editor.view.dispatch(tr);
            },
            command,
            stylesheet,
            linkSchemes,
          ),
    check: (command) =>
      !editable
        ? { ok: false, reason: 'not-applicable', message: 'This document is read-only.' }
        : checkCommand(editor.state, command, stylesheet, linkSchemes),
    getContext: () => editorContext(editor.state, stylesheet),
  };
}
