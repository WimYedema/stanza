import { Editor, type Extensions } from '@tiptap/core';
import {
  nodeIdFromRandomBytes,
  type Diagnostic,
  type Document,
  type Stylesheet,
} from '@phrase/core';
import { SCOPE_CLASS, compileStylesheetToCss } from '@phrase/css';
import { BlockIds, type IdSource } from './block-ids.js';
import { checkCommand, runCommand, type CommandResult, type EditorCommand } from './commands.js';
import { editorContext, type EditorContext } from './context.js';
import { ContextClasses, REFRESH_CLASSES, contextClassesKey } from './context-classes.js';
import { fromEditorContent, toEditorContent, type FromEditorResult } from './convert.js';
import { PhraseKeys } from './keys.js';
import type { Notice } from './notice.js';
import { PhrasePaste } from './paste.js';
import {
  PhraseBlockView,
  PHRASE_BLOCK_EMPTY_CLASS,
  PHRASE_BLOCK_LABEL_CLASS,
} from './phrase-block-view.js';
import { editorPosition, moveTo, type EditorPosition } from './position.js';
import { PHRASE_BLOCK_CLASS, schemaExtensions } from './schema.js';

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

.${SCOPE_CLASS} .${PHRASE_BLOCK_CLASS} {
  margin: 6pt 0;
  padding: 4pt 8pt;
  border: 1px dashed #999999;
  color: #555555;
  font: 10pt sans-serif;
  user-select: none;
}

.${SCOPE_CLASS} .${PHRASE_BLOCK_LABEL_CLASS} {
  margin-bottom: 4pt;
  color: #777777;
  font: 9pt sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.${SCOPE_CLASS} .${PHRASE_BLOCK_EMPTY_CLASS} {
  color: #888888;
  font: italic 10pt sans-serif;
}

.${SCOPE_CLASS} .selectedCell {
  background-color: #C8DCFF;
}
`;

export interface PhraseEditorOptions {
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
}

export interface PhraseEditor {
  /** The document the editor holds, with the metadata it was given. */
  getDocument(): FromEditorResult;
  /** Replaces the content, for example after the file changed on disk. Does not call `onChange`. */
  setDocument(document: Document): void;
  /** Applies a new stylesheet. With errors it changes nothing and returns them. */
  setStylesheet(stylesheet: Stylesheet): readonly Diagnostic[];
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
export function phraseExtensions(
  stylesheet: () => Stylesheet,
  notice: (notice: Notice) => void,
  ids: IdSource = randomIds,
): Extensions {
  return [
    ...schemaExtensions(),
    BlockIds.configure({ ...ids, notice }),
    ContextClasses.configure({ stylesheet }),
    PhraseBlockView.configure({ stylesheet }),
    PhraseKeys.configure({ stylesheet, notice }),
    PhrasePaste.configure({ stylesheet, notice }),
  ];
}

/** Starts an editor for a document and stylesheet (ADR 0022). */
export function createPhraseEditor(options: PhraseEditorOptions): PhraseEditor {
  let stylesheet = options.stylesheet;
  let meta = options.document.meta;
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
    extensions: phraseExtensions(
      () => stylesheet,
      (notice) => options.onNotice?.(notice),
      {
        newId: options.newId ?? randomIds.newId,
        usedIds: options.usedIds ?? randomIds.usedIds,
      },
    ),
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

  return {
    getDocument: () => fromEditorContent(editor.state.doc, meta),
    setDocument(document) {
      meta = document.meta;
      editor.commands.setContent(toEditorContent(document), { emitUpdate: false });
    },
    setStylesheet(next) {
      const compiled = compile(next);
      if (compiled.css === '') return compiled.diagnostics;
      stylesheet = next;
      style.textContent = compiled.css;
      editor.view.dispatch(editor.state.tr.setMeta(contextClassesKey, REFRESH_CLASSES));
      return compiled.diagnostics;
    },
    destroy() {
      editor.destroy();
      style.remove();
    },
    getPosition: () => editorPosition(editor.state),
    setPosition(position) {
      editor.view.dispatch(moveTo(editor.state, position));
    },
    run: (command) =>
      runCommand(
        editor.state,
        (tr) => {
          editor.view.dispatch(tr);
        },
        command,
        stylesheet,
      ),
    check: (command) => checkCommand(editor.state, command, stylesheet),
    getContext: () => editorContext(editor.state, stylesheet),
  };
}
