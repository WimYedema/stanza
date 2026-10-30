# ADR 0018: Table of contents

Status: Accepted

## Context

The vision wants a table of contents block with a depth setting, derived from the headings. Entries must be visible without any update, and page numbers, which only Word knows, are a stylesheet option. Heading numbers are literal text (ADR 0011) and every heading can carry a bookmark (ADR 0009).

## Decision

### The block

A table of contents is a `phrase-toc` block (ADR 0001, ADR 0004). Its body is empty or the one line `depth: N`, with N from 1 to 6; the default is 3. Any other line, a repeated depth, or a bad value is `invalid-toc-options`. The block is only allowed at the top level of a document (`toc-not-top-level`). It lists the top-level headings down to the depth, in order, as the literal heading number, a space, and the plain text of the heading. Several blocks are allowed.

### Styles

Entries use the paragraph styles `toc-1` to `toc-6`, one for each level down to the depth. The stylesheet must declare `toc-1` to `toc-N` for a depth N that a document uses (`missing-toc-style`); they are not reserved, so a stylesheet that has no table of contents needs none. A table of contents with no heading within its depth is a warning (`toc-empty`) and writes nothing. In Word the styles are `TOC1` and so on, named `toc 1`, which are the styles Word's own field uses. Heading styles get an outline level equal to their level, so a Word update finds the same headings.

### Page numbers

The stylesheet has a `table-of-contents` section with the option `page-numbers`, true by default.

- **On.** One Word table-of-contents field marked for update (`TOC \h \o "1-N" \u`) holds the entries as its cached result, each linked to the bookmark of its heading, with an empty page number. Word asks once on open whether to update fields; accepting fills in page numbers, and declining leaves the entries as they are. This is the prompt that the vision accepts.
- **Off.** Plain linked paragraphs in the same styles, with no field, no tab and no prompt.

A heading without an ID cannot be linked. Its entry is written as text, and the missing ID is already a warning.

### Page number alignment

The library writes the right tab of the page numbers at a fixed A4 position, with a `clear` tab for the one Word's own style would have. The styles here have no such tab, so `finishPackage` replaces the pair with one right tab with a dot leader at the text width of the page template. This is a fourth place with explicit properties in the output, after those of ADR 0008, ADR 0012 and ADR 0017, and the workaround is kept in one function in `package.ts`.

### Format

The stylesheet format stays at version 1, since the section is optional. The document format has no change.

## Consequences

- The table of contents is useful and clickable without Word updating anything.
- Page numbers are correct after one update in Word, and depend on no layout done here.
- A Word update replaces the cached entries by its own; the entry styles and the right tab come from the same styles and the paragraph tab, so the result looks the same.
- Documents with a table of contents need the `toc-N` styles. The example project declares three.

## Alternatives considered

- **Letting the library fill the field from the headings.** It links to its own bookmarks, not to the IDs of ADR 0009.
- **Always plain entries.** No prompt, but no page numbers, which the vision wants as the default.
- **Reserving `toc-1` to `toc-6`.** Every stylesheet would carry styles it may never use.

## Not covered

A table of figures and tables (a later item), tables of contents of part of a document, and entries for headings inside list items.
