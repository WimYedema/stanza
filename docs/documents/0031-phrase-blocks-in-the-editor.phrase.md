---
phrase-format: 1
title: "ADR 0031: Phrase blocks in the editor"
---

<!-- phrase: #yzghv44m78 -->
# ADR 0031: Phrase blocks in the editor

Status: Accepted

<!-- phrase: #mn1e9qcmbe -->
## Context

ADR 0022 shows a phrase block as a box labelled with its name, such as `phrase-toc`. That is the notation of the file, not something a person writing a document should see, and a table of contents that shows nothing of its content says little.

<!-- phrase: #qx0vadk1jm -->
## Decision

A phrase block is drawn by a node view of the editor. The block itself is unchanged: its kind and body are kept as they are, the clipboard HTML is the same, and nothing of what is drawn is stored.

- A table of contents shows a label, "Table of contents (down to level N)", with ", page numbers added by Word" when the stylesheet asks for page numbers (ADR 0018), and under it the entries it would have: the top-level headings down to its depth, with their numbers, each in the paragraph style `toc-N` of its level. There are no page numbers, since only Word knows them. Without headings it says "No headings yet."
- Any other kind is shown as `Phrase block "kind"`.

The entries come from `readTocOptions`, `numberHeadings` and `collectTocEntries` of `core`, the same as the DOCX export, applied to the headings of the editor's document. A block is drawn again when the document or the stylesheet changes, after each transaction that changes either.

<!-- phrase: #90qv3drhrf -->
## Consequences

- A person sees the outline of the document where the table of contents will be, and what a change of a heading does to it.
- The entries are an approximation of the output: the pages are missing, and a long heading is not wrapped as Word wraps it.
- Every change of the document walks its top-level blocks once for each table of contents on screen.

<!-- phrase: #vyvk56dj4t -->
## Alternatives considered

- **Only a better label.** It costs nothing but shows nothing of the content.
- **Entries as decorations.** An atom block has no content to put them in.
- **Page numbers as an estimate.** They would look more sure than they are (ADR 0028).
