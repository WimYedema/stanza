---
stanza-format: 1
title: "ADR 0090: Title block"
---

<!-- stanza: #je7hkrnk0b -->
# ADR 0090: Title block

Status: Accepted. Backlog item 232, after ADR 0089. Decided with the product owner on 2026-11-25.

<!-- stanza: #8s1qcf6e9b -->
## Context

A report without a cover, such as a memo, minutes or a short note, still starts with title matter at the top of its first page: often a logo, the title and a subtitle, and a line or a small table of metadata. It is a condensed version of what a cover shows, and it comes from the metadata in the same way. A report with a cover sometimes repeats a part of it there.

Until now a document could only write such lines as content, which puts the look of the title matter in every document instead of in the template, and makes the title text a copy of the metadata.

<!-- stanza: #gcqf3fdebx -->
## Decision

- **A page template can have a `title-block`:** a list of the entries of a cover (ADR 0019, ADR 0089): paragraphs and tables with metadata tokens, and images. It is a property of the template, as the cover is, and documents select it by selecting the template.
- **It is written at the start of the body,** before the first block of the document and so before its table of contents, on the same page. A template can have a cover, a title block, both or neither.
- **It has no rows, no heights and no margins of its own.** Its entries flow from the top of the text area and the body follows them. Rows only place content on a page of fixed size, and that is what a cover is for.
- **The rules of the entries are those of a cover:** a paragraph without text, a table row without a value and a table without rows are left out, and a title block with nothing left is not written. The pagination tokens (`page`, `pages`, `section`) are errors, with the codes of the cover. An image is at most as wide as the body text, with a warning when it is asked to be wider.
- **The editor shows it** at the top of the page sheet, above the text, as it shows the cover: the text of its entries in their styles, without images (item 222). It is not part of the document and cannot be edited there.
- **The image diagnostics are named for images, not covers:** `image-not-found`, `image-unsupported`, `image-too-wide`, `image-too-tall` and `image-line-spacing`, since they apply to a title block too, and later to figures (item 163).

The stylesheet stays at format version 1, since `title-block` is optional. The document format does not change.

<!-- stanza: #q0vcwwr8d2 -->
## Consequences

- A memo or a note gets its title matter from the template, and its first line of content can be its first heading or paragraph.
- A document that already writes its title as a heading and uses a title block shows the title twice; that is for the author to choose.
- The title block is not a heading, so it is not in the table of contents and has no number.

<!-- stanza: #e7eykjcaf3 -->
## Alternatives considered

- **Rows, as on a cover.** Without a fixed height a row has nothing to divide, and alignment within a row that grows changes nothing. Columns, such as a logo beside the title, will come with item 225 and can be added here then.
- **A block in the document, such as a `stanza-title` block.** It would let a document choose where its title matter goes, but every document would have to repeat it, and the template could not change it for all.
- **A different first-page header.** It is how Word templates often put a logo on the first page, but the vision rules out different first pages, and a header cannot hold a table that the body flows after.

<!-- stanza: #34wwcq1223 -->
## Not covered

Columns in a title block (item 225), drawing images in the editor (item 222), and a title block that differs per document beyond its metadata.
