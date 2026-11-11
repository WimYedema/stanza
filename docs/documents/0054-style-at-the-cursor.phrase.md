---
phrase-format: 1
title: "ADR 0054: The style at the cursor, in the document editor"
---

<!-- phrase: #rc0abz27vh -->
# ADR 0054: The style at the cursor, in the document editor

Status: Accepted. Where the panel is, and that the style editor does not open at the style, are replaced by ADR 0055.

<!-- phrase: #xt1spdxnr1 -->
## Context

The document editor shows a style by its name or label in the toolbar (ADR 0027), and the style editor shows what a style says (ADR 0036 to 0040, 0050, 0051, 0053). A person who writes in a document cannot see what the style of the paragraph means, or whether changing it would touch other documents, without opening the stylesheet. The usage index (ADR 0052) knows where styles are used.

<!-- phrase: #m3z2wnabr7 -->
## Decision

- **A read only panel under the toolbar**, closed by default, with one line: `Style: Heading 1`, or `Style: Table cell · Table` in a table. Opened, it has a card for each style at the cursor.
- **The cards.** One for the paragraph style of the block (in a table cell, the cell style), and one for the table style when the cursor is in a table. A card has:
  - the name and label, and the styles it is based on;
  - the resolved properties, bases applied, each with the style that gives it when it is not the style's own (`Font: Calibri (from body)`);
  - for a paragraph style, the marks it allows; for a table style, the cell style, the padding, the borders and the header row;
  - where it is used: the number of blocks and documents, with a line for each document that says how many blocks name the style, have it by default, or reach it through a style based on it, and which document is this one;
  - a button, **Edit style**, that opens the style editor on the stylesheet of the project.
- **The usage comes from the host.** After `init`, and again whenever it changes, the host sends a `usage` message with the counts for each style and document, worked out from the loaded project with `styleUsage` (ADR 0052). A style that nothing uses is left out. The project is loaded again after every change of a document, so the counts follow what is typed, with the delay that the other project checks have. The page says that the usage is not known until the message has come.
- **The panel is drawn again** only when the style at the cursor, the stylesheet or the usage changes, and not on every key, so that the button keeps the focus.
- **The button** sends `edit-styles`, and the host runs the command that opens the style editor (ADR 0036) for the document in front. The editor does not open at the style yet.

<!-- phrase: #hacxj6wzxh -->
## Consequences

- A person can see what a style means and what changing it would reach, from where they write.
- The panel adds to what the page holds in two ways: the messages `usage` and `edit-styles`, and the project is checked for usage on every refresh, which is a pass over the loaded documents and not over the files.
- A character style at the cursor has no card. Only the paragraph and the table style do.
- A style that is used by a document outside the project folder is not counted (ADR 0052).

<!-- phrase: #bs7mj6dvet -->
## Alternatives considered

- **Counting in the page.** It has only the one document, and not the others of the project.
- **Opening the style editor at the style.** It needs a way to tell an editor that is open, or about to open, which style to select. That is a separate change with its own cases, suggested as its own item.
- **Showing the panel in the side bar of VS Code.** It would follow the cursor, but it would be a second place to look, and the page already has the toolbar, the stylesheet and the document in one view.
