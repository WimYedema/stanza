---
phrase-format: 1
title: "ADR 0069: Making a reference in the editor"
---

<!-- phrase: #ng7epnftdb -->
# ADR 0069: Making a reference in the editor

Status: Accepted. Builds on ADR 0068.

<!-- phrase: #d6d6bxzskq -->
## Context

A reference is a link to `#<id>` (ADR 0068). Writing the ID by hand is not an option, and a document such as the threat model has hundreds of mentions ("see I5") that should become references. The selected text is the natural start.

<!-- phrase: #shc1vpddk1 -->
## Decision

- **One command, `set-reference` (id, text).** With text selected, it makes the selection a link to the block and keeps the text. With nothing selected it inserts `text` as the link. It follows the rules of the stylesheet like the other mark commands: a style that does not offer `link` refuses it, with the fix of ADR 0026, and code blocks refuse it. It needs the ID of a block, so a title or a made-up destination is refused.
- **The list of targets is pure.** `suggestReferences(document, query)` in `core` gives the top-level headings that have an ID. For a query it gives only the matches, the best first: the leading code of the heading (`I5` in "I5 — Secrets exposed"), the title with or without the code, a start, a part, then all the words, with document order inside a kind. When nothing matches it gives all headings. No network, no model.
- **Nothing selected inserts the code of the heading** when it has one (`I5`), else its text, since that is how such a document refers to its threats.
- **The list is drawn in the webview**, from the document in the editor, saved or not: a field, the headings indented by level, arrows and Enter, Escape to close. The webview holds the selection, so no round trip to the extension is needed, and the same list can serve a typing shorthand later.
- **Ways to open it**: a toolbar button ("Ref", disabled with its reason where no link can be made), `Ctrl+Shift+K` in the editor, the command "Phrase: Make Reference", and the context menu of the editor (`webview/context`, with `data-vscode-context`), so that Cut, Copy and Paste stay. The command only tells the webview to open the list.
- **Nothing is changed without a choice.** Finding the text that should be a reference in the whole document is a separate item.

<!-- phrase: #3asyg7v4y1 -->
## Consequences

- Only headings can be picked; other blocks with an ID, and table rows (item 121), are not offered.
- A heading without an ID is not offered. The editor gives IDs to new headings (ADR 0024), and "assign IDs" gives them to the rest.
- Not checked in a real VS Code: that `webviewId` is the view type for a custom editor, so the context menu entry may need another `when` clause, and the look and keys of the list.
