---
phrase-format: 1
title: "ADR 0055: One line for the state and the style, and Edit style at the style"
---

<!-- phrase: #4xcb77hggy -->
# ADR 0055: One line for the state and the style, and Edit style at the style

Status: Accepted. It replaces two points of ADR 0054: where the panel is, and that the style editor does not open at the style.

<!-- phrase: #kmj80scdp3 -->
## Context

ADR 0054 put a panel for the style at the cursor under the notices line, next to the line of the toolbar that tells the state at the cursor (ADR 0027). The page then had four rows above the document, the toolbar, the state line, the notices and the style panel, which is much of a small window. And the Edit style button opened the style editor without showing the style that the person was looking at.

<!-- phrase: #k3nt1m78e2 -->
## Decision

<!-- phrase: #c4kgey3ztq -->
### One line

- The line of the toolbar that tells the state at the cursor is gone as an element of its own. The summary of the style panel shows the same text (`Paragraph | style: default | no marks`), so the line that tells the state is also the one that opens the style. The function that writes the text, `describeContext`, stays in the toolbar module.
- The panel is in the bar that sticks to the top, as the second row under the buttons. Opened, the cards float over the document, with a height of at most 60 percent of the window and a scroll, so that opening them does not push the document down.
- The line of the notices takes no room when there is no notice.
- The line is shown whenever an editor is there, also where the cursor is in no block, and then it says so.

<!-- phrase: #r6ces8ceac -->
### Edit style at the style

- Each card sends its own style with `edit-styles`: the kind (`paragraph-style` or `table-style`) and the name. The host passes it as the argument of the command that opens the style editor (ADR 0036), which then asks the editor of the stylesheet to select it.
- A new message of the style editor, `select-style`, tells its page which style to select. If the editor is open and has started, it is sent at once. If it is not, the request waits and is sent after `init`. A request that nothing took up in ten seconds is dropped, so that an editor that is opened later does not jump to a style.
- The page selects the style in the tab of its family, and shows its panel. A style that the stylesheet does not have selects nothing.
- The command takes the style as an optional argument. Anything that is not a style of a known kind is ignored, and the editor opens as before.

<!-- phrase: #17tczvpyw8 -->
## Consequences

- The window has the toolbar and one line above the document.
- A person can go from a paragraph to the definition of its style in one click, and back with the tab of the document.
- Opening the cards is one click on the line, as before.

<!-- phrase: #vcv4tp7dnh -->
## Alternatives considered

- **Keeping the state line and the style line apart and hiding one.** The two say much the same thing about the same place.
- **Cards under the line that move the document.** They would shift the text that the person is writing in.
- **Selecting by a link that the style editor opens from the file.** The messages already exist between the host and the page, and a link would need a scheme of its own.
