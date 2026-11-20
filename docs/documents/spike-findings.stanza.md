---
stanza-format: 1
title: "Spike findings"
---

<!-- stanza: #f002x1qt4x -->
# Spike findings

Backlog items 1 to 4. Corpus: one real policy document (11 pages, 9 tables, 33 comments, tracked changes). The throwaway tooling was removed from the tree; it remains in Git history.

<!-- stanza: #y5956jrmr4 -->
## What worked

- A DOCX converts to Markdown plus YAML front matter and a stylesheet, and renders back to DOCX with named styles only. The rebuilt document has no direct paragraph or run formatting.
- Body text round-trips exactly: 203 of 204 paragraphs match; the other is the metadata text box, which became front matter.
- The rebuilt PDF is close to the original: headings, lists, tags, headers, footers, and page numbers are right.

<!-- stanza: #52d8dvyet6 -->
## Corpus measurements

- 15 styles used in the body. Only Heading 1 and 2. Body text is the default Normal style.
- Direct formatting is rare: 24 of 285 paragraphs (almost all spacing), 100 of 500 runs but about 3% of characters. Most of the run formatting is one status-tag look.
- The same status tag (`[proposed]`, `[confirm]`) appeared in three different manual looks. This is the inconsistency the product exists to prevent.
- Tables are formatted almost entirely by direct cell borders, widths, and shading. Only 3 of 9 use a table style.
- Metadata sits in content controls and a text box. The cover is a layout table plus custom styles.
- About 55 empty paragraphs and one empty heading act as spacing or are authoring errors.

<!-- stanza: #xy8ghan7nt -->
## Decisions taken

<!-- stanza: #x4dhgvk8fh -->
| Topic | Decision |
| --- | --- |
| Status tags | User-defined character style in the project's stylesheet, not part of the core model |
| Metadata | YAML front matter per document, shared settings in a project file |
| Tables | Named table styles; autofit column widths by default, optional relative weights; no per-cell formatting |
| Cover page | A page template filled from metadata; the body starts on a new page by template rule |
| Page breaks | A styling concern, not content |
| TOC | Entries as linked paragraphs; page numbers as page-number fields (variant D below) |
| Empty paragraphs and diagnostics | Ignored for now |
| Comments | Postponed (backlog: Word comment import) |
| Tracked changes | The accepted state is used |

<!-- stanza: #f6ntxmsy83 -->
## TOC test in Word

<!-- stanza: #4pq0pxbn8v -->
| Variant | Result |
| --- | --- |
| A: Word's TOC field, marked for update | Prompt "This document contains fields that may refer to other files. Do you want to update the fields in this document?" Page numbers show 1 before updating and are correct after. The TOC disappears if the reader declines. |
| B: same field, not marked | Empty until updated manually |
| C: linked entries, no page numbers | Visible, no prompt, no page numbers, no leaders |
| D: linked entries plus page-number fields | Prompt on open. Entries are visible; page numbers show 1 until updated and are correct after. Leaders and layout are fine. |

Variant D is the design: entries are always visible, and page numbers are correct once fields are updated. The prompt is accepted.

<!-- stanza: #8dbychm0gq -->
## `docx` library verification

`spikes/docx-verify/verify.mjs` generates a document with `docx` 9.15 and checks the XML (16 checks pass). Every capability backlog item 15 asked about is covered:

- **Table styles:** a table takes a style by ID (`style`), and `tableLook` switches on the first-row formatting. The library has no declarative API for defining a table style. The definition comes in as a `w:styles` XML string through `externalStyles`, which the adapter generates from the typed stylesheet. Paragraph and character styles given declaratively replace external styles with the same ID, so there is one definition.
- **Autofit and relative widths:** `layout: AUTOFIT`, percentage table width, percentage cell widths, and an explicit grid in twips are all written as given.
- **Repeated header rows:** `tableHeader` writes `w:tblHeader`.
- **TOC with cached entries:** `cachedEntries` writes the field with visible entries, each linked to a bookmark by name.
- **Bookmarks:** names are free text and IDs are unique. Word requires a bookmark name to start with a letter, and our IDs can start with a digit, so names are prefixed (`stanza_<id>`).

Not checked by the script: that Word opens the file without a repair prompt and shows the table style and TOC as intended. The output is in `spikes/out/docx-verify.docx` for a manual look.

<!-- stanza: #pd08v8q8bc -->
## Pandoc observations

Relevant to the Pandoc decision (ADR 0002):

- Bold and italic are direct formatting unless mapped to character styles.
- Cell paragraphs get a forced "Compact" style unless wrapped as ordinary paragraphs.
- A table style must be given by its ID, not its name.
- The writer builds a title block from metadata unless it is cleared.
- Relative table widths in Markdown (grid-table dash counts) are not reproduced faithfully. Column widths need an explicit notation.
- List numbering definitions come from Pandoc, not the reference document.
- A table between list items cannot be indented as part of the list without nesting it in the Markdown source.

<!-- stanza: #2bz8ys1tt0 -->
## Not reproduced

Cover layout table, page breaks, merged cells, original column widths, and the metadata block (the title block must be generated from metadata).
