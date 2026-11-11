---
phrase-format: 1
title: "ADR 0026: Style choice and allowing a mark in a style"
---

<!-- phrase: #qstwsxfn71 -->
# ADR 0026: Style choice and allowing a mark in a style

Status: Accepted

<!-- phrase: #x9hndy2k98 -->
## Context

ADR 0006 lets the stylesheet decide which marks a style offers, and ADR 0023 makes the editor refuse a command that would put a mark where its style does not allow it. A refusal tells the person editing what is wrong and not what to do. The way out is to declare the variant in the stylesheet, which is a decision about the look of the project, so it is never made by itself. Two other things were missing: a way to choose the style of a block, and a way for an interface to ask what is possible at the cursor without trying it. Item 52 builds the toolbar on the same questions.

<!-- phrase: #qbh6ryvckj -->
## Decision

<!-- phrase: #naw4n3m875 -->
### The state at the cursor

`editor.getContext()` gives plain data about the selection (`editorContext` in the editor package): the kind of the first block (`paragraph`, `heading`, `code-block`, `table-cell`), the style it names itself (for a cell, the style of the table), the paragraph style that decides its marks, for each of strong, emphasis, code and link whether the mark is on and whether every selected block allows it, the character styles that are on, and the styles the stylesheet declares. It reads the state and changes nothing.

<!-- phrase: #be5zny402m -->
### Asking before doing

`editor.check(command)` answers what `run(command)` would, and changes nothing. `run` and `check` share one evaluation (`evaluate`): the command is planned, tried on a state without plugins, and compared with the stylesheet. IDs are not given and notices are not sent by a check. A check goes through the whole document twice to find the marks that a change would introduce, so an interface calls it when the person asks (opening a list), and not for every key.

<!-- phrase: #nvgjgd6kng -->
### Refusals carry a fix

`Fix` in core is `{ kind: 'declare-variant', style, mark }`. A refusal of the reasons `mark-not-allowed` and `marks-not-allowed` that a variant would remove has it (`CommandResult.fix`), and so has the diagnostic `mark-not-allowed` of document validation (`Diagnostic.fix`). Nothing else changes in the messages. A refusal that no stylesheet change would remove, such as a mark in a code block, has no fix. When several marks are in the way, the fix names the first, and the next refusal names the next.

<!-- phrase: #ctdp90qrds -->
### Declaring the variant

`declareVariant(text, style, mark)` in the format package returns the new text of a stylesheet. It edits the text where the style is, using the positions that the `yaml` library gives for the nodes, and does not write the document again: comments, order, quoting and the other lines stay as they are. The cases are:

- a variant switched off with `false` is replaced;
- a variant declared already leaves the text as it was;
- a `variants` block gets a line at its indentation;
- a style with no `variants` gets the block after its last line, or in place of an empty `{}`;
- a style, or `variants`, written as a flow mapping with content (`{ size: 11 }`), a `null` value, or anything else that cannot be edited without guessing, is not edited. The result says so, and the message names what to add by hand.

The edited text must read as a stylesheet without errors and allow the mark. The line ending of the file is kept. What is declared: strong `{ bold: true }`, emphasis `{ italic: true }`, link `{ underline: true }`, and code `{}`. The fonts and colors of a project are not known here, so a code variant has no properties and the stylesheet is for the person to complete. The variant is declared on the style itself, which styles based on it inherit.

<!-- phrase: #4dzws2cb9f -->
### The extension

- The webview offers the fix as a button on the refusal, "Allow strong in plain", and the editor's text of the refusal stays. Nothing is declared until the button is clicked. It sends `declare-variant`, which the host checks like every message.
- The host edits the open document of the stylesheet with a `WorkspaceEdit` of the lines that differ, and sends the new `stylesheet`, and then `declared`. The webview then tries the refused command again, once. A second refusal shows its own button and is never tried again by itself.
- The stylesheet is not saved by the edit. It is saved when the document that needed it is saved (`StylesheetSaves`, one listener for all editors), and once. Until then the editor, the Problems panel and everything else that reads the project see the change, because the project is read from the open documents (ADR 0025), but a build from the files does not.
- A change to a `.yaml` file now makes the open editors read the project again, as a change to a document does, so a stylesheet edited in the text editor shows at once and not after saving.
- The same fix is a quick fix on the Problems entry of the text editor. It runs the command `phrase.declareVariant` with the document, the style and the mark. The fixes are kept by project and found again by the file, the code and the message of the diagnostic.

<!-- phrase: #1xcqvez562 -->
### The style lists of the toolbar

The sketch toolbar has a list of the styles of the block (the table styles when the cursor is in a cell, with "(default)" to clear the style) and a list of character styles that toggles one. Their options are checked with `check` when the list is opened. An option that cannot be done is disabled, with the reason as its title. An option that a declared variant would allow stays enabled and reads "(needs strong)", so that choosing it leads to the refusal and its button. The lists show what the block has again after a command, also a refused one. Item 52 replaces the toolbar.

<!-- phrase: #yhnk27dyfj -->
## Consequences

- The editor stays free of the stylesheet's text. It names the change that is needed, and the format package and the extension make it.
- The person editing decides about the look of the project explicitly and in one click, in the editor or in the text, and the change is a few lines in a file that Git shows.
- A stylesheet laid out in a way that the edit does not support needs a change by hand. That is the cost of not rewriting the file; the message says what to add.
- The edit of the stylesheet is in the history of the VS Code document of that file, so it can be undone there.
- A stylesheet that was changed and not saved stays that way if the document is never saved. VS Code shows it as modified.

<!-- phrase: #9721tw6esj -->
## Alternatives considered

- Declaring the variant when a command is refused. It decides the look of the project without being asked.
- Rewriting the stylesheet with the `yaml` library's printer. It changes the spacing of other lines, for example of `['a', 'b']`, and so makes a diff that is not about the change.
- Saving the stylesheet at once. It writes a file that the person may not have in front of them; saving it with the document keeps the two together.
- Disabling every option that would be refused. The person then has no way to reach the offer from the list.
