---
stanza-format: 1
title: "ADR 0052: The style usage index"
---

<!-- stanza: #zb4xmyn90v -->
# ADR 0052: The style usage index

Status: Accepted

<!-- stanza: #j47yzvc8t5 -->
## Context

Deleting a style (backlog item 74), and showing where a style is used (item 62), both need to know which documents and blocks use it. A document says little: most blocks name no style, and a style is also in use when another style is based on it.

<!-- stanza: #5e7ve6hg4p -->
## Decision

`styleUsage(documents, stylesheet)` in the `project` package gives, for every paragraph, character and table style of the stylesheet, the list of its uses over the documents that were loaded, in the order of the documents and of the blocks. It is a pure function of what `loadProject` returns, so it reads no files.

A use has a **kind**, the **file**, the **path** of the block (as the checks write it, `blocks[2].items[0].blocks[1]`), the ID of the block when it has one, and for an inherited use the style that is used (`via`).

- **Direct**: the block names the style, or a text has a `style` mark of that character style.
- **Default**: the block is of a kind that has the style when it names none: a heading has `heading-N`, a paragraph `body`, a code block `code`, a list `list-bulleted` or `list-numbered`, a table `table`, and a `phrase-toc` block `toc-1` to `toc-N` for its depth.
- **Inherited**: the style is a base, at any distance, of a style that is used. It is recorded for the block that uses the derived style, with that style in `via`.

Some rules about what is a use:

- The paragraphs in the items of a list take the style of the list, so the list is the use, once. A paragraph in an item that names a style of its own is a direct use of it.
- A table is one use of its table style. The paragraphs and lists in its cells are default uses of the cell style of the table (its own or from a base, else `body`) and of the list styles, at the path of the table, since a cell block has no style or ID of its own (ADR 0048).
- A use is counted once for a style, a block and a kind, however many times it occurs in the block.
- A style that the document names and the stylesheet does not have is left out. The document checks report it.
- Every style of the stylesheet is in the result, with an empty list when it is unused, so that a caller does not need to tell "unused" from "unknown".

Not counted: references inside the stylesheet (a table style's cell style, the style of a header line, of a cover entry, or the base of a style). They are in the one file the caller already has, and a check of them belongs to the item that needs it (74).

<!-- stanza: #n6avyd0zbv -->
## Consequences

- Item 74 can refuse to delete a style that any document uses, directly, by default or through a derived style, and can say where.
- Item 62 can list the documents and blocks for a style, grouped by kind.
- The index is computed from the documents as they are loaded. The host must load the project again to get a fresh one after an edit.

<!-- stanza: #bdy1ma1z1g -->
## Alternatives considered

- **Counting only direct uses.** It would let a person delete `body` or a heading style that every block uses by default, and break the documents.
- **Putting it in `core`.** It needs the loaded documents with their paths, which `project` has, and nothing else in `core` works over several documents.
