# Backlog

Prioritized, highest first. Format: `N. [size] - description`.

Sizes are relative effort: XS, S, M, L, XL. They are not time estimates.

## Done

Finished items are in `docs/BACKLOG_DONE.md`, one line each. Item numbers are kept.

## Phase 5: Editor and review

Placed before Phases 3 and 4 by the product owner.

114. [S] - Links from the chat open at the right place: a link to a `.phrase.md` file with a line opens the Phrase editor and scrolls to the block that holds that line. Investigate first what VS Code gives a custom editor when it is opened from a link with a selection; if it gives nothing, find another way. Added at the request of the product owner, if possible.
95. [S] - The documents of this repository as a Phrase project: `docs/` and `README.md` become a project with its own stylesheet, adopted with item 94, so that the product describes itself. Added at the request of the product owner.
38. [L] - Import Word comments anchored by bookmark IDs. Report comments whose anchor no longer exists.
39. [M] - Show imported comments next to the content in the editor.
77. [M] - Colors and fonts only from theme tokens: ADR first, since ADR 0006 allows hex colors and family lists in styles. Then the stylesheet reading and validation, the exporters, and the fixtures follow; a raw value becomes a diagnostic that says which token to use. Added at the request of the product owner.
78. [S] - Style editor, theme values in the panel: colors and fonts are chosen from a list of the theme's tokens with a swatch or a font sample, the row says where the value comes from ("Theme: mono"), and a value that is not a token shows as "Custom" with a warning until a token is picked. A note in the panel says that these values come from the theme. Replaces the text fields with suggestions of item 68.
79. [S] - Style editor, link to the theme: from a color or font row, a link to that token in the Theme tab. Needs item 72.

## Phase 6: Forms
99. [M] - Cell styles chosen by the content of the cell: named cell styles (background, and text properties such as bold) and rules on a table style, "a cell whose whole text equals X (trimmed, case-insensitive) gets cell style Y", resolved when rendering and exporting, so the document stays plain text. Compiled to the browser CSS and to cell shading in DOCX (generated output, centralised). ADR first, including whether a value without a rule is reported. Added at the request of the product owner.
100. [M] - Forms, design and ADR: a form is a definition in the project (an ordered list of fields, each with an immutable ID, a label, and plain or rich values) and an instance in a document (probably a `phrase-form` block that names the form, with values keyed by field ID), shown as a table of `field | value`. Settle the dialect, the definition file, the diagnostics (missing, unknown, duplicate field), the DOCX mapping, and how an existing table becomes a form. Discuss with the product owner before any code. Added at the request of the product owner.
101. [L] - Forms, definition, format, core and DOCX (ADR of item 100): read the definition, parse and write the block, the diagnostics, and a table in DOCX and CSS.
102. [M] - Forms, editor: fixed labels with editable values, and a command that turns a table into a form.
103. [M] - Forms, allowed values: a field can list the values it accepts, with a diagnostic for others and a choice list in the editor. Colour rules of item 99 can then belong to a field.

## Phase 3: Pipeline (CLI, no editor)

28. [S] - GitHub Actions workflow running build, test, and lint on pull requests. Low priority: local checks are sufficient for now.
29. [S] - Build info: version, date, and revision from Git (tag, commit date, draft marker), with overrides from the project file and CLI flags, feeding the header and cover tokens. Low priority: tokens stay empty until then.
53. [S] - VS Code commands in the Command Palette: build the project (one DOCX per document into `build/`), export the current document to DOCX, validate, format, and assign IDs, with their results in the Problems panel or an output channel. Export on save moved to item 65. The exporter and the command line exist already (items 16 and 26); this makes them available without a terminal. Low priority.

## Phase 4: Collections and references

30. [M] - Project model: multiple documents, shared stylesheet, document order.
31. [M] - Reference index: resolve, find incoming, find broken. Cross-document references with computed display text.
32. [M] - Numbering across a project (headings, figures, tables, appendices).

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
