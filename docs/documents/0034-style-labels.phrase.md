---
phrase-format: 1
title: "ADR 0034: Labels of styles"
---

<!-- phrase: #tp9dbs8x6q -->
# ADR 0034: Labels of styles

Status: Accepted

<!-- phrase: #exn78yg1qf -->
## Context

A style is named by an identifier in kebab-case, such as `cover-meta`. Documents refer to it by that name (`<!-- phrase: .cover-meta -->`), so it cannot change without changing every document of the project. People who pick a style in the editor, and who see it in Word, would rather read "Cover details". ADR 0008 gives a custom style a display name made from its identifier in title case, and says nothing about a name of its own.

<!-- phrase: #4m7f1bk2y5 -->
## Decision

<!-- phrase: #8r8sn4ah8h -->
### The label

Every paragraph style, character style and table style can have a `label`, written in the stylesheet next to `based-on`. It is text for people. The identifier stays what documents, the stylesheet and the diagnostics refer to, so a label can be changed without touching a document. A label is not inherited by styles that are based on the style.

A label is 1 to 80 characters, with no space at either end, no control characters, and no comma or semicolon, which Word reads as the separators of the aliases of a style (`invalid-label`). Labels are unique ignoring case across all kinds of styles, since Word keeps the names of styles together (`duplicate-label`). The stylesheet format stays at version 1, because the property is optional.

<!-- phrase: #c8tysay0ec -->
### Word

A style that Word names itself keeps that name, whatever its label, so that the outline, the table of contents and the navigation work: `body` is `Normal`, `heading-1` to `heading-6` are `heading 1` to `heading 6`, and `toc-1` to `toc-6` are `toc 1` to `toc 6`. The label of these styles is only for the editor. Every other style is shown in Word by its label, or, without one, by its identifier in title case as before. The Word style ID never changes with a label, so it is still made from the identifier and a document that was exported earlier keeps its styles.

The names of the styles that the exporter generates from a style (the character styles for marks, the continuation styles of lists, the styles of a table header) are made of the Word name of the style they come from, so they use its label too.

A label of a style other than those that Word names itself may not be a name that Word has built in (`builtin-label`), compared ignoring case, from a list of Word's own style names in `core`. Word would take such a style for its own and apply the properties to it. The exporter also reports two styles that end up with the same name in Word, ignoring case, for instance a label that equals the title-cased identifier of another style (`style-name-collision`).

<!-- phrase: #226aw134e2 -->
### The editor

The editor shows labels: the list of the block (the styles, and for a table cell the table styles), the list of character styles and the state line. The values and the commands keep the identifiers. `EditorContext` gives the labels of the styles that have one. Messages about a refusal, the diagnostics, the Markdown files and the stylesheet text keep the identifiers, since they are what a person looks up in a file.

<!-- phrase: #3wmthdhrkb -->
## Consequences

- A style can be renamed for people with one line in the stylesheet, and no document changes. Changing the identifier is still a change in every document, and nothing here helps with it.
- A label that a person gives to `body` or a heading shows in the editor and not in Word. The style editor should say so.
- The names of the styles in a DOCX that was built before a label was added change when it is built again. Their IDs do not.
- The list of Word's built-in names is a copy of a list that Word owns, and may miss names of a later version of Word.

<!-- phrase: #6k1hc1f8an -->
## Alternatives considered

- **Changing the identifier.** It is what documents refer to.
- **Letting a label also rename the Word style of `body` and the headings.** It would break the outline and the table of contents of Word, which find those styles by their names.
- **A label per language.** Nothing asks for it.
