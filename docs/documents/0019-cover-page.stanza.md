---
stanza-format: 1
title: "ADR 0019: Cover page"
---

<!-- stanza: #2dajqw744r -->
# ADR 0019: Cover page

Status: Accepted

<!-- stanza: #ydbtzj7ksz -->
## Context

The vision wants a cover page as part of a page template, filled from document metadata, with the body starting on a new page because the template says so. ADR 0016 anticipated a separate Word section for it, and ADR 0017 left the cover with its own slots open.

<!-- stanza: #2k7026y6g6 -->
## Decision

<!-- stanza: #a6zkvk57z6 -->
### Where the cover lives

A page template can have a `cover`: an ordered list of entries. A template without `cover` behaves as before. A document gets the cover of the template that it selects (ADR 0016). Two variants, with and without a cover, are two templates.

<!-- stanza: #z4fg53sxz0 -->
### Entries

- A paragraph entry is `{ style, text }`. The `style` is a paragraph style and defaults to `body`. The `text` uses the slot notation of ADR 0017, `[label](phrase:token)`.
- A table entry is `{ table: { style, rows } }`, a two-column table of rows `{ label, value }`. The `label` is plain text and the `value` uses the slot notation. The `style` is a table style and defaults to `table`.

An entry is either one or the other (`invalid-value`). Unknown properties are errors.

<!-- stanza: #ygdc0gzxd2 -->
### Tokens

The tokens of ADR 0017 apply: `title`, `version`, `classification`. Two are added, and they also work in headers and footers:

- `authors`, the authors of the document joined with ", ".
- `field:<name>`, the custom metadata field with that kebab-case name, such as `[](phrase:field:document-number)`. A list value is joined with ", ". The stylesheet does not check the name against the project, since the project is not known to it.

`page`, `pages` and `section` are Word fields that depend on pagination, and are errors on a cover (`cover-token-not-allowed`). A style that is not declared is `unknown-cover-style`.

<!-- stanza: #2vrzqs71sd -->
### Values that are missing

The label shows when a value is missing, as in headers. A paragraph with no text after that, and a table row whose value is empty, are left out. A table with no rows is left out. A cover with nothing left is not written, and the document has one section.

<!-- stanza: #5xe4ddw5ax -->
### Export

The cover is turned into ordinary paragraph and table blocks with literal text and goes through the same mapping as the body. Styles are named styles and nothing is formatted directly. A cover table has no header row. The block model requires one in a document, but a cover is built by the exporter and not read from a document, so the table mapping accepts an empty header row and writes none.

The cover is its own Word section, ending with a next-page section break, with the page size and margins of the template. It has no header and no footer. The body is a second section with the template's header and footer, as ADR 0016 and ADR 0017 say.

<!-- stanza: #qty52k64z3 -->
### Page numbers

The body section restarts its numbering at 1, so the cover is not counted. With a cover, the `pages` token is written as `SECTIONPAGES` and not `NUMPAGES`, so that the footer reads "Page 1 of 5" for a document of five pages after the cover. Without a cover the output is as before. The table of contents (ADR 0018) is in the body, and its page numbers follow the restarted numbering.

<!-- stanza: #7gz1m0nh70 -->
### Format

The stylesheet stays at format version 1, since `cover` and the new tokens are optional. The decoder in `format` reuses the slot decoder, and `core` holds the cover model and checks it. The document format does not change.

<!-- stanza: #zjwxmw9nps -->
## Consequences

- A cover can show metadata in lines and a table without a layout engine, and its look comes from named styles.
- Documents with different covers need different templates.
- A custom field named in a cover that a document lacks shows its label, so a draft cover can show a placeholder.
- The page numbers in a document with a cover differ from the physical page by one.

<!-- stanza: #nyhmy28e4j -->
## Alternatives considered

- **A page break written into the first body paragraph.** It would be direct formatting, and the cover could not leave out its header and footer.
- **Counting the cover as page 1.** Common in print, but it needs a field that computes the page of the last body page to stay correct.
- **A separate `covers` section that templates refer to.** It shares covers between templates, at the price of one more concept.

<!-- stanza: #vm858ae4ar -->
## Not covered

Framed boxes and floating content (item 44), vertical centring of the cover, a `date` token (build information, item 29), different first pages, and a metadata table with a header row.
