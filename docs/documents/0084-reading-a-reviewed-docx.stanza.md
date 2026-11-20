---
stanza-format: 1
title: "ADR 0084: Reading a reviewed DOCX"
---

<!-- stanza: #z5yj54z72q -->
# ADR 0084: Reading a reviewed DOCX

Status: Accepted. First part of item 140; builds on ADRs 0009, 0030 and 0083.

<!-- stanza: #p7jbj0kmtz -->
## Context

Item 140 brings the Word comments of a reviewed DOCX into the project. Before anything is written, an author needs to see whether the bookmarks survived the review, for instance in SharePoint and Word for the web, and where each comment lands.

<!-- stanza: #v4jk1h966c -->
## Decision

- **Read, never apply.** `readReview` in `import-docx` reads the bookmarks and the comments of a DOCX. Nothing in the file changes the source (vision, principle 8).
- **Placing a comment.** A comment starts at its `commentRangeStart`, or at its `commentReference` when it has no range. It covers the block whose Stanza bookmark is open where it starts, and every block whose bookmark starts before its `commentRangeEnd`: those are its `blocks`, in order. Its main `block` is the first of them, so a selection that starts in text without an ID belongs to the first block with an ID inside it. When it covers no bookmark, it is placed `after` the last one before it, usually its heading, since only blocks with an ID have bookmarks (ADR 0009); with none before it, it is `unplaced`.
- **Old bookmarks.** `stanza_<id>` and `phrase_<id>` are both read (ADR 0083). Other bookmarks, such as `_Toc`, are ignored.
- **Against the project.** `inspectReview` in `project` gives each placed comment its document and the heading of its section. The file's document is the one most of its bookmarks belong to. It reports comments it cannot place, bookmarks the project no longer has, and blocks with an ID that have no bookmark in the file. Without the revision stamp of item 138, a block added since the build and a bookmark lost in review look the same, and the report says so.
- **`stanza review inspect <file.docx> [project]`.** Prints the comments by document and heading. Exit 1 when a comment cannot be placed or the file has no Stanza bookmarks, 2 when a file cannot be read.

<!-- stanza: #rkxknrqrn4 -->
## Consequences

`reviews pull` (the rest of item 140) writes these placed comments into review documents. Replies are listed as separate comments for now; their threads are in `commentsExtended.xml`, which is not read yet.
