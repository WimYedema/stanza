import { Editor } from '@tiptap/core';
import type { Diagnostic, Document, Stylesheet } from '@phrase/core';
import { SCOPE_CLASS, compileStylesheetToCss } from '@phrase/css';
import { ContextClasses, REFRESH_CLASSES, contextClassesKey } from './context-classes.js';
import { fromEditorContent, toEditorContent, type FromEditorResult } from './convert.js';
import { PHRASE_BLOCK_CLASS, schemaExtensions } from './schema.js';
import { UniqueIds } from './unique-ids.js';

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
}

export interface PhraseEditor {
  /** The document the editor holds, with the metadata it was given. */
  getDocument(): FromEditorResult;
  /** Replaces the content, for example after the file changed on disk. Does not call `onChange`. */
  setDocument(document: Document): void;
  /** Applies a new stylesheet. With errors it changes nothing and returns them. */
  setStylesheet(stylesheet: Stylesheet): readonly Diagnostic[];
  destroy(): void;
}

function compile(stylesheet: Stylesheet): { css: string; diagnostics: readonly Diagnostic[] } {
  const { css, diagnostics } = compileStylesheetToCss(stylesheet);
  return { css: css === undefined ? '' : `${EDITOR_CHROME_CSS}\n${css}`, diagnostics };
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
  style.textContent = first.css;
  options.element.prepend(style);

  const editor = new Editor({
    element: options.element,
    extensions: [
      ...schemaExtensions(),
      UniqueIds,
      ContextClasses.configure({ stylesheet: () => stylesheet }),
    ],
    content: toEditorContent(options.document),
    editorProps: { attributes: { class: SCOPE_CLASS } },
    onUpdate: ({ editor: current }) => {
      options.onChange?.(fromEditorContent(current.state.doc, meta));
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
  };
}
