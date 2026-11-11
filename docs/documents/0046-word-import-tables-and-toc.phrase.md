---
phrase-format: 1
title: "ADR 0046: Tables and the table of contents in the Word import"
---

<!-- phrase: #9emrb0akht -->
# ADR 0046: Tables and the table of contents in the Word import

Status: Accepted

<!-- phrase: #qrsqr3y035 -->
## Context

ADR 0043 says that simple tables with a header row become tables, that tables which cannot be represented are flattened into their cells, and that a Word table of contents becomes a `phrase-toc` block. It does not say how the header row is recognized, what cannot be represented, or how the depth is read. Real documents decide this: most tables of the sample documents have no repeating header row, but their look marks the first row as a header, and merged cells and tables in cells occur.

<!-- phrase: #4y1ktsrn2j -->
## Decision

<!-- phrase: #53skp7y16j -->
### The header row

The first row is the header when it repeats as a header (`w:tblHeader`) or when the look of the table says so: `w:tblLook` with `firstRow` on, or, when only the bit mask `w:val` is given, its bit `0x20`. A table with neither has no header row.

<!-- phrase: #baf7erm7y3 -->
### What becomes a table

A table becomes a `table` block with the default style when it has a header row and every row has the same number of columns. It never has widths, so it autofits. Everything else is written as paragraphs, one for each cell that has text, row by row, and reported as `table-flattened`.

Cells are the text of their paragraphs with marks, joined with spaces. A merged cell (`gridSpan`, `vMerge`) keeps its text in the first cell and is followed by empty cells for the grid columns it covers, so the rows stay equal. A table inside a cell has its paragraphs joined into the cell. A list in a cell is joined as text. Merged cells, joined paragraphs and nested tables are reported (`merged-cells`, `cell-joined`, `nested-table`). A row that was deleted as a tracked change is left out. A table in a text box is always written as paragraphs.

The first row is taken as the header even when it is the only row.

<!-- phrase: #ee6gm0jznx -->
### The table of contents

A complex field (`TOC`) or a simple field with an instruction that starts with `TOC` becomes one `phrase-toc` block at the paragraph where it begins. The depth is the upper bound of the `\o "1-N"` switch, limited to 1 to 6; with no such switch the body is empty and the default depth applies. Everything the field showed is dropped without a line for each entry: its paragraphs, links and page numbers. One line says that a field was replaced (`toc-field`). A table of contents that is only text in the styles `TOC 1` and so on has no field, and stays as text.

<!-- phrase: #877t1nerw8 -->
## Consequences

- The imported tables are as good as the header marking of the Word file. A table whose first row only looks like a header, with no marking, is written as paragraphs, and the person can rebuild it.
- A table with a header row that is really a label column, as in tables of fields and values, becomes a table whose header holds the first pair. The text is all there.

<!-- phrase: #8qq580wxa4 -->
## Alternatives considered

- **Taking the first row of every table as the header.** It would make a header of the first row of a table that has none, and the report could not tell the two apart.
- **Refusing a merged cell.** Most real tables with a merge are otherwise simple, and the text is kept.
- **A paragraph for each row, with the cells joined.** It reads better for tables of fields and values but loses the cell boundaries that ADR 0043 keeps.
