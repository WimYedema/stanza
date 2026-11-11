---
phrase-format: 1
title: "ADR 0036: The style editor, shell"
---

<!-- phrase: #cfntk5mj9z -->
# ADR 0036: The style editor, shell

Status: Accepted

<!-- phrase: #a7gf420ztj -->
## Context

The stylesheet is a text file, and changing a look means editing YAML by hand (ADR 0006), with the help of one click for a variant (ADR 0026). The style editor is a custom editor on that file, with a panel for each family of styles. It is built in slices, and this record covers the first: the editor around the panels, which lists the styles by family and shows what they look like. The panels that change properties come with the next items.

<!-- phrase: #dzms8cee37 -->
## Decision

<!-- phrase: #6wkbas034y -->
### A custom editor on the stylesheet, opened on purpose

The extension contributes a second custom text editor, `phrase.styles` ("Phrase Styles"), for `*.yaml` files with the priority `option`: it is never the default, so a YAML file opens as text unless a person chooses the editor with "Open With". The command "Phrase: Edit Styles" opens the stylesheet of the project of the editor in front, whether that is a text editor or a document in the visual editor, or the only project of the workspace, or one that is picked from several.

The editor takes only the stylesheet that the project file names. For any other file, including `phrase.yaml`, it shows why and offers to open the file as text. A file that is in no project, or in a project whose file has errors, is refused in the same way. It is bound to the text of the file like the document editor (ADR 0025): the text is read from the open document, and a change in the text editor or on disk is shown at once.

<!-- phrase: #qcckhqfn1h -->
### What the shell shows

- **Tabs** for the families: Paragraphs, Headings, Lists, Tables, Character styles, Pages and Theme, each with the number of its entries. The headings and the list styles are the paragraph styles that the model reserves for them (`heading-1` to `heading-6`, `list-bulleted`, `list-numbered`). The rest are paragraphs. Pages are the page templates, and the theme is the colour and font tokens.
- **A list** of the entries of the tab, by label, with the name under it when it differs (ADR 0034).
- **A detail** for the selected entry that says what the stylesheet says about it: its name, label and base style, the page of a template, the value of a token. It is read only.
- **A sample document**, made from the stylesheet: a heading of every level, text with every mark and every character style, a table of contents, a bulleted list with a numbered one in it, a code block, a table for every table style, and a paragraph for every other paragraph style. It is drawn by the editor of ADR 0022 with the CSS of ADR 0021, in a view that cannot be edited (a new `editable` option), and it is drawn again when the text changes. Selecting a style marks what it looks like in the sample and brings it into view.

A stylesheet with errors is not shown as a stylesheet. When the editor opens on one, it says what is wrong and offers the text. When errors appear while it is open, it keeps what it showed and says at the top that the stylesheet has errors, so that typing in the text editor does not make the view flicker.

<!-- phrase: #npjk3evm0j -->
### Messages and page

The messages are plain data and are checked on both sides, as for the document editor (`styles-protocol`). The page has the same content security policy. The script is a third bundle, `styles.js`.

<!-- phrase: #6q1y588rtn -->
## Consequences

- A person can see every style of a project as it will look, and what the stylesheet says about it, without reading YAML.
- Nothing is changed from the style editor yet. The panels of the next items edit the open text with `setProperty` and `unsetProperty` (ADR 0035), so the undo of VS Code covers them.
- The sample shows a paragraph for every paragraph style, including those that exist for output, such as `header-footer` and the `toc` styles. A style that only shows in a header or a cover is seen on its own paragraph, not where it is used.
- The choice of `*.yaml` is wide, and the refusal for files that are not the stylesheet is the price of keeping the editor out of the way.

<!-- phrase: #8eyaqbvqmm -->
## Alternatives considered

- **The default editor for the stylesheet.** It would take away the text, which people also want, and the stylesheet's file name is not fixed.
- **A panel inside the document editor.** The stylesheet is shared by documents, and the document editor is crowded already.
- **A sample taken from a document of the project.** It would show only the styles that the document uses. A built-in sample shows all of them, and a document can come later with the item on styles in the document view.
