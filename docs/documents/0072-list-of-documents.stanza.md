---
stanza-format: 1
title: "ADR 0072: The list of documents of a project"
---

<!-- stanza: #720813cnew -->
# ADR 0072: The list of documents of a project

Status: Accepted. Refines ADR 0007 and ADR 0014.

<!-- stanza: #bhxdhbwe38 -->
## Context

A project has the documents that are found below its root, sorted by path (ADR 0014). It has no order of its own, no way to leave a file out, and no structure. Navigation, the numbering across documents (item 32) and a later combined publication all need an order and a hierarchy that the author controls.

<!-- stanza: #7zbwkm1m3n -->
## Decision

- **`documents` in `phrase.yaml`** is an optional outline: a list whose entries are a path, or a group, which is a mapping with a `group` title and its own `items`. Groups nest. A group has no file; it only gives documents a place. The property is additive, so `phrase-format` stays 1.
- **Without the property nothing changes**: all documents are listed, by path.
- **With it, the list is the order and the membership.** Reading it gives `OutlineEntry` values in `core`, and `outlinePaths` gives the documents in order.
- **Checks.** A path that is not a safe relative path, a document listed twice (also in two groups), and a group without a title are errors in the project file. A listed document that does not exist, or whose path does not end in `.phrase.md`, is an error when the project is loaded (`missing-document`, `invalid-path`).
- **A document that the list leaves out** is a warning (`unlisted-document`). It is still loaded and checked, so its errors and its IDs count, but it is not built by `phrase build`. It comes after the listed documents in the Phrase view, marked "not listed". Exporting it from the editor still works.
- **The loaded project** gives its documents with the listed ones first, in order, a `listed` flag on each, and the `outline`: the declared one, or all documents by path.
- **The Phrase view** shows the groups and the order.
- **The words.** An outline of documents is a *collection* when it is one of several (later). A *publication* is a collection that is built as one output (later). The word *theme* is not used, since it means the stylesheet tokens.

<!-- stanza: #2mkwzb4q2a -->
## Consequences

- A project that lists its documents must keep the list in step with its files. Adding a document by hand needs a line in the list until the commands do it (item 123).
- A document appears once in an outline, so numbering across documents has one meaning. Several collections, a document in more than one, and the context that numbers and cross-reference text then need are left for later; numbers are always computed for a collection and never stored.
- References still target block IDs, so moving a document or changing the list does not break them.
- Not done here: appending to the list from "new document", "import" and "adopt"; a quick fix for unlisted and missing documents; reordering in the view.
