---
stanza-format: 1
title: "ADR 0068: References inside a document"
---

<!-- stanza: #gheeqzgczt -->
# ADR 0068: References inside a document

Status: Accepted. Refines ADR 0001 and ADR 0009.

<!-- stanza: #emxj2921g3 -->
## Context

ADR 0001 and the architecture left the syntax of a reference open. The editor already accepts a link whose destination is `#` and an ID, but nothing checks it, and the DOCX export writes it as an external link that does not reach the bookmark of the block (ADR 0009). In a document such as the threat model, hundreds of mentions of a threat ("see I5") are plain text that should be references.

<!-- stanza: #6m67fen48r -->
## Decision

- **A reference is a link whose destination is `#` and the ID of a block**, such as `[I5](#k7m2q9x4zb)`. There is no new mark and no new syntax; the dialect and the model do not change. The text of the link is kept as written. Text computed from the target (a number, a title) is a later item.
- **A target is a block that has an ID** in the document: headings and tables, and any other block that carries one (ADR 0001). Blocks in table cells cannot have IDs, so they are not targets.
- **The index** is derived from a document each time, never stored: `indexReferences` gives the targets and the references in document order, with `resolveReference`, `findIncoming` and `findBroken` as pure functions of it. Runs of text that share a destination are one reference.
- **A broken reference is the error `broken-reference`.** It is reported when the destination is not an ID, or is the ID of a block that is not in the document, with the path of the content and the ID of the block that holds it. A deleted target never turns the reference into plain text.
- **The scope is one document.** A link to a block of another document is reported until the cross-document references (item 31) give the check the targets of the whole project.
- **A destination like `#my-title` is an error**, not a GitHub anchor: references target IDs, never titles.

<!-- stanza: #4xpr6m4jzv -->
## Consequences

- A document with a broken reference does not export, since the export needs a validated document.
- On GitHub a reference is a link to an anchor that is not there; the text still reads well. Nothing is written for GitHub.
- Not done here: the DOCX hyperlink (item 117), the editor commands (items 118 to 120), IDs in table cells (item 121) and computed text (item 122).
