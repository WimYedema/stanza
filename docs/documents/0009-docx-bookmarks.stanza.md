---
stanza-format: 1
title: "ADR 0009: DOCX bookmarks"
---

<!-- stanza: #1bnrzbqsk3 -->
# ADR 0009: DOCX bookmarks

Status: Accepted

<!-- stanza: #xdn47kzbsw -->
## Context

References target immutable IDs, never titles or rendered numbers (ADR 0004). In DOCX a reference becomes a link or a field that points at a bookmark, and the table of contents links to bookmarks too. The `docx` library check (docs/SPIKE_FINDINGS.md) showed that bookmark names are free text, but Word requires a name to start with a letter and our IDs can start with a digit.

<!-- stanza: #v53nzvs4b1 -->
## Decision

- Every block that has an ID gets a bookmark named `phrase_<id>`. It wraps the content of the block's paragraph, so a link to it lands on the text.
- Bookmarks are written by the exporter and are not part of the model. Blocks without an ID get none, and validation already warns about headings and tables without one.
- Bookmark numbers (`w:id`) are assigned in document order, starting at 1 in every export. The library draws them from a counter shared by all exports, so the exporter renumbers them to keep the output deterministic (ADR 0008).
- Links in the document that point at a block ID become internal hyperlinks in the item that defines references.

<!-- stanza: #542y8kfq0k -->
## Consequences

- Any block with an ID can be the target of a cross-reference or a table-of-contents entry without further work in the exporter.
- The name prefix is part of the DOCX output. A change to it would break links in documents that others have kept.

<!-- stanza: #xwppr8aaev -->
## Alternatives considered

- **Bookmarks only on headings and tables.** The model already says every block with an ID is referenceable, so a second rule would be needed for no gain.
- **A bookmark named after the ID without a prefix.** Word rejects names that start with a digit.
