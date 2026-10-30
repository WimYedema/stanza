# ADR 0022: Editor schema and adapter

Status: Accepted. Commands, keys and paste, and the names of styles in the clipboard HTML as data attributes: ADR 0023. The unique-ID plugin became the plugin of ADR 0024.

## Context

ADR 0003 puts the editor in Tiptap on ProseMirror, with the domain model in `core` as the canonical content and the ProseMirror document authoritative only while a document is open. ADR 0021 defines the class names that the generated CSS expects. This record covers the `editor` package: its schema, how it converts to and from the domain model, how it writes the classes, and what it depends on. Commands and paste handling are a separate backlog item.

## Decision

### Package and API

`editor` runs in a DOM and may import `core` and `css` only, besides Tiptap and ProseMirror. It does not import `format`: the host parses and serializes text and hands over a `Document`. Its API uses `core` types only:

- `createPhraseEditor({ element, stylesheet, document, onChange })` returns an editor with `getDocument()`, `setDocument(document)`, `setStylesheet(stylesheet)` and `destroy()`.
- `getDocument()` and `onChange` give a result with the document, or with diagnostics and no document when the content cannot be written as a document.
- `setStylesheet` recompiles the CSS and swaps the style element without touching the editor state. A stylesheet with errors changes nothing and returns its diagnostics. Starting with one is an error.
- The front matter is not edited here. The metadata passes through unchanged.

### One vocabulary

`core` declares the kinds of block and mark with their attributes, and the marks in canonical order (`BLOCK_ATTRIBUTES`, `MARK_ATTRIBUTES`, `MARK_TYPES`). The normalisation uses the same mark order. The editor's extensions are written by hand, and a test compares the schema with the declaration: the marks and their order, the attributes of each block, and the absence of any other attribute. ADR 0003 says the schema is built from the declaration. A check does the same job of preventing drift, and generating a schema from data would be generality that nothing needs yet.

### Schema

Nodes are `doc`, `heading` (`level`), `paragraph`, bulleted and numbered lists with `listItem`, `codeBlock` (`language`), `table` (`widths`) with rows of `tableHeader` and `tableCell`, and `phraseBlock` (`kind`, `text`). Blocks also have `id` and `style`. Marks are `link` (`href`), `style` (`name`), `strong`, `emphasis` and `code`, in canonical order. There is no hard break, image or history.

- A list item holds paragraphs, lists, tables, code blocks and phrase blocks, as the model does. An empty item and an empty code block exist as they do in the model.
- Table cells hold inline content only, since the model has no paragraph style in a cell. A table may have no rows, as a table with no columns is an error for validation to report and not for the editor to repair.
- A phrase block is an atom that is kept as it is and shown as a labelled box. Unknown kinds are kept.
- Attributes are data. None is read from or written to HTML, in particular not the HTML `style` attribute, whose name collides with the style name of a block.
- The table library writes inline widths, column groups, a wrapper element and an `align` attribute. All of it is switched off. Its cell attributes `colspan`, `rowspan` and `colwidth` remain, always at their default, because its commands read them. A cell that spans several columns is reported when converting.

### Classes by decoration

The classes of ADR 0021 depend on context: a list item takes its look from its list, the text of an item carries no class of its own, and a cell takes the cell style of its table. A `renderHTML` function cannot see that context, so a plugin computes the class of every block from the document and the stylesheet and adds it as a node decoration. The classes are never stored in the document, and recomputing is a matter of one transaction. `renderHTML` writes only the structure, the list class, and the classes of marks and character styles, which do not depend on context. The editor's own parts, such as the box of a phrase block, the selected cell, and the margin reset of unstyled item text, have a small stylesheet of their own that is written next to the generated one.

### Conversion

`toEditorContent(document)` and `fromEditorContent(node, meta)` are pure and need no DOM. The result of the second is in normal form (ADR 0005). Anything that the model cannot hold is reported with a path and is not repaired, and there is then no document: an invalid ID, style name or level, column widths that are not positive, a link without a target, a merged cell, or a header cell below the first row. A table whose first row has only header cells has a header row. The acceptance test takes every fixture of the format and of the example project through parse, editor and back, and compares both the model and the serialized text.

### IDs

Existing IDs are kept. A block that is split in the middle gets the attributes of the original on both halves, so a plugin clears a repeated ID, and the first block of the repetition, which is the original of a split, keeps it. Assigning IDs to new blocks and stopping pasted copies from taking an ID are the work of the unique-ID item and the paste item.

### Dependencies

`@tiptap/core`, `@tiptap/pm` and `@tiptap/extension-table`, all MIT and pinned by the lockfile. The table library is used because the logic of tables (selection, navigation, row and column commands) is not something to rewrite. The starter kit and the extensions for underline, color, font, highlight, alignment and text style are not used, since they carry direct formatting. Dev only: `jsdom` for the tests that need a DOM, and `esbuild` for the throwaway preview. No dependency calls the network at runtime.

### Not in this item

Commands and paste normalisation (item 50), heading numbers and inline diagnostics (item 51), assigning IDs (item 35), the VS Code host (item 36), the style picker (item 37), and undo and redo, which ADR 0003 settles in the host.

## Consequences

- The editor can show any valid document without a single visual property in its content, and a stylesheet change updates it live.
- Round trips are tested on real documents, so a change to the model or the schema that breaks canonical text fails a test.
- The table library's own repair of ragged rows runs on edits, so a ragged table that validation reports may become regular after an edit.
- Copying a block inside the editor and pasting it before the original gives the ID to the copy until the paste item strips IDs.

## Alternatives considered

- **A schema generated from the vocabulary.** Less to write by hand, but a generator for six node kinds is more code than the test that guards them.
- **Classes in `renderHTML`.** Simpler, but a list item and a table cell could not take the style of their context.
- **Paragraphs inside table cells.** They would allow a style on a cell paragraph that the model cannot hold.
- **Plain ProseMirror without Tiptap.** ADR 0003 and ADR 0002 settled on Tiptap, whose commands and extension model the next items use.

## Not covered

Collaboration, comments in the editor, and a page preview.
