---
phrase-format: 1
title: "ADR 0027: Editor toolbar and keys"
---

<!-- phrase: #ska8p6dh7v -->
# ADR 0027: Editor toolbar and keys

Status: Accepted

<!-- phrase: #ky5cznea3t -->
## Context

ADR 0025 shipped the toolbar of the preview as it was: a button for each command, and a line for notices. ADR 0026 added `getContext` and `check`, so that an interface can ask what is at the cursor and what is possible, and said that item 52 builds the toolbar on them. This ADR records how, and the keys that go with it.

<!-- phrase: #023br6asd7 -->
## Decision

<!-- phrase: #fph4qnb5f7 -->
### Knowing when to look

`createPhraseEditor` takes `onContextChange`, called after every transaction: a move of the cursor, a change, a new stylesheet. It carries no data; the interface asks `getContext` and `check`.

`EditorContext` gains `level` (of a heading) and `list` (`bulleted` or `numbered`, of the innermost list around the first block), so that a button can show that it is on.

<!-- phrase: #t46eyzdprs -->
### The toolbar

- A line under the buttons tells the state at the cursor: the block (Paragraph, Heading n, Code block, Table cell, and the kind of list it is in), its style (the table style for a cell, `default` when the block names none), and the marks and character styles that are on.
- A button that toggles (the marks, Paragraph, H1 to H6, the lists, Code block) has `aria-pressed` and is drawn as on.
- Each button is checked with `check`. A command that has no place at the cursor (a row command outside a table, Sink on the first item) is disabled and its title says why. A refusal that a declared variant would remove leaves the button enabled and drawn with a dashed border, with the refusal as its title, so that a click leads to the refusal and its button (ADR 0026). The titles also name the keys.
- The state is shown after a pause of 80 ms from the last transaction, because a check goes through the document twice (ADR 0026) and there are about twenty buttons. The lists of styles are checked when they are opened, as before, and between uses only show the style of the block.
- Refusals are shown as before, on the line of notices, which is now a live region. A refusal from a key is a notice too, without a fix button.

<!-- phrase: #xd2nypj9hm -->
### Keys

`Ctrl+Alt+0` makes the block a paragraph, `Ctrl+Alt+1` to `6` a heading of that level (`Cmd+Alt` on a Mac). They run the same commands as the buttons and are refused in the same way. `Backspace` with the cursor at the start of a heading makes it a paragraph, keeping the text and the ID. It is the `set-paragraph` command, so a style that would not allow the marks of the text refuses it.

<!-- phrase: #t7b8qy850b -->
## Consequences

- The toolbar costs a number of checks for each pause in typing. If that is too slow in long documents, the next step is to check only the commands that the kind of block can use, not to drop the checks.
- A button that a variant would allow is not disabled, which is the cost of keeping the offer reachable.
- `Ctrl+Alt` is `AltGr` on some keyboard layouts; the digits may type a character there. A setting for the keys is left for later.

<!-- phrase: #7014w99ztg -->
## Alternatives considered

- Disabling every command that would be refused. The person then has no way to reach the offer of ADR 0026.
- Checking on every transaction without a pause. It makes typing slow in a long document.
- Native VS Code keybindings for the headings. The webview has the focus, so the editor has to handle the keys, as it does for marks.
