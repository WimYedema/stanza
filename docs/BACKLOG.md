# Backlog

Prioritized, highest first. Format: `N. [size] - description`.

Sizes are relative effort: XS, S, M, L, XL. They are not time estimates.

## Done

Finished items are in `docs/BACKLOG_DONE.md`, one line each. Item numbers are kept.

## Theme: Editor and review

Placed before the themes "Pipeline (CLI, no editor)" and "Collections and references" by the product owner.

## Theme: Collections and references

The references inside one document are done (items 116 to 118, 120; item 119 is under Later). A reference is a link whose destination is `#<id>` of a heading or another block that has an ID (no new syntax in the file), with the text kept as written. Targets are headings for now.

30. [M] - Project model: multiple documents, shared stylesheet, document order.
31. [M] - Cross-document references: the reference index of item 116 across the documents of a project, with computed display text. Needs items 30 and 116.
32. [M] - Numbering across a project (headings, figures, tables, appendices).


## Theme: Word import
38. [L] - Import Word comments anchored by bookmark IDs. Report comments whose anchor no longer exists.
39. [M] - Show imported comments next to the content in the editor.

## Theme: Forms
99. [M] - Cell styles chosen by the content of the cell: named cell styles (background, and text properties such as bold) and rules on a table style, "a cell whose whole text equals X (trimmed, case-insensitive) gets cell style Y", resolved when rendering and exporting, so the document stays plain text. Compiled to the browser CSS and to cell shading in DOCX (generated output, centralised). ADR first, including whether a value without a rule is reported. Added at the request of the product owner.
100. [M] - Forms, design and ADR: a form is a definition in the project (an ordered list of fields, each with an immutable ID, a label, and plain or rich values) and an instance in a document (probably a `phrase-form` block that names the form, with values keyed by field ID), shown as a table of `field | value`. Settle the dialect, the definition file, the diagnostics (missing, unknown, duplicate field), the DOCX mapping, and how an existing table becomes a form. Discuss with the product owner before any code. Added at the request of the product owner.
101. [L] - Forms, definition, format, core and DOCX (ADR of item 100): read the definition, parse and write the block, the diagnostics, and a table in DOCX and CSS.
102. [M] - Forms, editor: fixed labels with editable values, and a command that turns a table into a form.
103. [M] - Forms, allowed values: a field can list the values it accepts, with a diagnostic for others and a choice list in the editor. Colour rules of item 99 can then belong to a field.

## Theme: Pipeline (CLI, no editor)

28. [S] - GitHub Actions workflow running build, test, and lint on pull requests. Low priority: local checks are sufficient for now.
29. [S] - Build info: version, date, and revision from Git (tag, commit date, draft marker), with overrides from the project file and CLI flags, feeding the header and cover tokens. Low priority: tokens stay empty until then.
53. [S] - VS Code commands in the Command Palette: build the project (one DOCX per document into `build/`), export the current document to DOCX, validate, format, and assign IDs, with their results in the Problems panel or an output channel. Export on save moved to item 65. The exporter and the command line exist already (items 16 and 26); this makes them available without a terminal. Low priority.

## Later

40. [L] - PDF adapter (ADR first; Typst is the leading candidate).
41. [S] - Semantic change summary by stable ID.
42. [M] - Glossary of referenceable terms.
43. [M] - Landscape sections.
44. [L] - Images, captions, and boxes: figures with captions, and boxes (framed or call-out blocks, such as the cover title of ADR 0006) with placement. Needs a design discussion first: box placement and floating content are outside the vision today, so a vision update and an ADR come before any code.
45. [S] - Table of figures and tables.
46. [M] - Minimal bibliography with a fixed citation style.
47. [M] - Browser host (VS Code web or standalone) behind the storage port.
76. [M] - Code family: code blocks get their own family in the style editor, apart from the `code` mark (the inline variant), with room for syntax highlighting by language later. Needs an ADR first: what the family contains, and whether the paragraph style `code` moves to it. Added at the request of the product owner.
91. [S] - Tables, header rows and columns: more than one header row, and header columns, as attributes of the table in its annotation (ADR 0048), working in both forms of a table.
92. [M] - Tables, merged cells: `colspan` and `rowspan`, probably as a marker on the cell in the `phrase-table` body. ADR first.
93. [M] - Tables from a CSV or JSON file in the project, as an attribute of the table in its annotation, read when the project is loaded or built. ADR first.
106. [S] - Line height like Word's: in the compiled CSS, `line-spacing: multiple` multiplies the natural line height of the font family (a small table of known families, Calibri about 1.22) and not the font size, so that a paragraph is as tall in the editor as in Word. Changes the look of the editor, not the file. Found by the spike of ADR 0058.
107. [S] - Table row height: find why a table row is 2.5 to 4 pt taller in the editor than in Word (cell padding, borders, paragraph spacing in cells) and bring the CSS in line, checked against Word. ADR 0058.
108. [M] - Page layout in the editor, undecided (ADR 0058): guides over the sheet, a read-only layout view with header and footer on every page (on request or after a pause), or spacer widgets. Decide first, with the product owner; then a pure page model in `core`. Items 106 and 107 come first.
115. [S] - Links that open the editor at a line, if VS Code allows it later: check whether a custom editor can be given the selection of a link (see ADR 0063), or whether `vscode://` links with a URI handler are let through by the chat, and then scroll to the block without `Ctrl+G`. Added with item 114.
121. [M] - References to table rows and to paragraphs in table cells (for example the boundaries TB1 to TB8 of the threat model): IDs on blocks inside cells and rows, which annotations do not allow now (they are read only before top-level blocks). Dialect decision first. Added with item 116.
122. [S] - Computed text of a reference in the document: the number or the title of the target, kept up to date, instead of the text as written. Added with item 116.
119. [M] - Editor, find possible references, postponed by the product owner: a command that lists the places where the text equals the title of a heading, or a name that the author gave it, with a preview, and turns one or all of them into references. Nothing is changed without the person choosing it. Phrase does not know how a document names its headings (codes such as T6; ADR 0070), so an ADR first settles how the author says it: an alias on a heading in its annotation, or a pattern in the project file that reads the name from the heading text, or the full text of the heading only. A coding assistant may do the bulk conversion as well; the single reference is item 118.
