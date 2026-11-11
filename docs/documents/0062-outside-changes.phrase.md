---
phrase-format: 1
title: "ADR 0062: Showing what changed from outside"
---

<!-- phrase: #axfsag3vc0 -->
# ADR 0062: Showing what changed from outside

Status: Accepted

<!-- phrase: #43d0pc2awc -->
## Context

An agent, Git or another editor can change the text of the open document. The editor takes the new text (ADR 0025) and puts the cursor at the change (ADR 0056), but the person cannot see what is new, which matters when an agent has edited the document (ADR 0061).

<!-- phrase: #qhzpzca90a -->
## Decision

- **Marks only.** Blocks that are new or different after a change from outside get a tint in the editor, and a bar at the top says how many blocks changed and how many were removed, with "Next change" (scrolls to the next marked block, wrapping) and "Dismiss". The marks stay until dismissed, and add up over several changes. Marks are decorations; they are never in the text.
- **Found by comparing blocks, not by ID.** Most blocks (paragraphs, lists) have no ID, so the old and the new top-level blocks are compared in order (longest common run, equal when type, attributes and content are equal). A block of the new text that has no equal in the old text is marked; an old block with none in the new is counted as removed. Marks follow the editing of the person, and are carried over a later outside change through the same comparison.
- **Undo and redo are not outside changes.** The host marks a change only when VS Code says it was not an undo or a redo (`TextDocumentChangeReason`). A restored block from an undo is not shown as new. A Git checkout or an agent is.
- **Not offered.** The old text of a changed block, and accepting or rejecting a block: undo in VS Code takes an agent's edit back, and keeping old versions needs a history that nothing else uses yet. This can be revisited when the need shows.
- **Large changes.** When the part between the common start and end of two documents is too large to compare (over about four million block pairs), every block in it counts as changed.

<!-- phrase: #37xj930p36 -->
## Consequences

- After an agent edits a document, the person sees where, and can step through the changes.
- A change that only moves a block shows as a removed block and a new one.
- The comparison runs once per outside change, not per keystroke.
