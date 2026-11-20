---
stanza-format: 1
title: "ADR 0063: Opening a document at a line"
---

<!-- stanza: #677xgmyhaw -->
# ADR 0063: Opening a document at a line

Status: Accepted

<!-- stanza: #rbk1r42c51 -->
## Context

A link in the chat (`file.phrase.md#L42`) or a click on the Problems panel opens the file with a selection, which a text editor shows at that line. The Phrase editor is the default editor of `.phrase.md` (ADR 0025), so the file opens in it. The question of item 114 was whether the editor can learn the line and scroll to its block.

<!-- stanza: #j0pp8q1hqm -->
## Findings

- The API gives it nothing. `CustomTextEditorProvider.resolveCustomTextEditor(document, webviewPanel, token)` has no selection or options. The tab of a custom editor (`TabInputCustom`) has only the URI and the view type. `TextDocumentShowOptions.selection` is documented for text editors. Opening with `vscode.open` and a selection, or with a `#L42` fragment, therefore cannot reach the editor.
- A probe in a real VS Code, to confirm this by trying, could not be run: VS Code refused to start a second instance while it was updating. The finding rests on the API as typed (`@types/vscode` 1.90).

<!-- stanza: #6vcry8mzha -->
## Decision

- **The link itself cannot be made to scroll.** It opens the document at the top, as before. Nothing is done to intercept it.
- **"Phrase: Go to Line" (`Ctrl+G` in the editor)** asks for a line of the Markdown text, or a link that ends in one (`notes.phrase.md#L42`, so the text of a chat link can be pasted), and scrolls to the block that holds it. A line before the first block (front matter) goes to the first block.
- **The block of a line** comes from `blockStartLines` in `format`, which reads the start line of each top-level block in the order of `parseDocument`, an annotation line counting as part of its block. A test keeps the two in step for every fixture.

<!-- stanza: #n5dwfndy8g -->
## Consequences

- After a click on a chat link, one more key and the pasted link get the person to the place.
- The Problems panel has the same limit; the findings are also drawn on the blocks (ADR 0057).
- Not done: links of our own (`vscode://` with a URI handler) that agents would have to write, since nothing shows that the chat lets them through; and making the text editor the default.
- If VS Code gives custom editors the selection later, the editor can scroll on its own with the same mapping.
