---
stanza-format: 1
title: "ADR 0056: The cursor after a change from outside"
---

<!-- stanza: #afky4vegv0 -->
# ADR 0056: The cursor after a change from outside

Status: Accepted. It replaces the sentence of ADR 0025 that puts the cursor back at the same block and the same number of characters into it.

<!-- stanza: #466m9rgerm -->
## Context

When the text of the document changes in another way than by typing in the editor, as with an undo or a redo in VS Code, a Git checkout or an edit in the text editor, the host sends the text and the editor replaces its content (ADR 0025). The cursor was put back where it had been, the same block and the same number of characters. After an undo that is the wrong place: the person has just undone a change somewhere, and the cursor is still where they were before, perhaps far from it.

<!-- stanza: #rbff7441d6 -->
## Decision

- After the content is replaced, the cursor goes to **where the content changed**. The old and the new content are compared from both ends, with the comparison that ProseMirror gives for two documents, and the cursor goes to the end of the changed part in the new content: after the text that came in (a redo, a pasted block), or at the place where text went out (an undo of typing).
- When a whole block is added or taken out at the end of the document, the cursor goes to the end of the nearest text before the change.
- When nothing changed, the cursor stays where it was (the block and the characters into it).
- The comparison is made on what the editor holds, so the same applies to every change from outside, not only to an undo: the cursor goes to the change.
- The editor has this as an option of `setDocument`, `cursor: 'at-change'`. Without it the cursor is left to the caller, as before.

<!-- stanza: #xssvvcyetz -->
## Consequences

- An undo or a redo shows what it did, and typing can go on from there.
- When two changes come at once, such as a Git checkout that changes the document in many places, the cursor goes to the last place, since the comparison gives one changed part from the first difference to the last.
- A change that gives the same text as before at the end and at the start, such as taking out one of two equal paragraphs, is placed at the first place where the comparison can tell them apart. That can be the other paragraph.

<!-- stanza: #sfek5y9y8s -->
## Alternatives considered

- **Getting the position from the line that VS Code undid.** The webview has the text and not the lines of the edit, and a comparison of the documents needs nothing from VS Code.
- **Leaving the cursor and scrolling to the change.** The person would see the change, but typing would go on in the wrong place.
