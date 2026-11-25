---
stanza-format: 1
title: "ADR 0092: Cover columns and areas"
---

<!-- stanza: #ayjrawwzcs -->
# ADR 0092: Cover columns and areas

Status: Accepted. Backlog item 225, refining ADR 0089. Decided with the product owner on 2026-11-25.

<!-- stanza: #h6rbgvggfs -->
## Context

The rows of ADR 0089 divide a cover from top to bottom. The cover corpus (spike findings, "Cover corpus") showed that 11 of 19 covers also divide it from left to right: a logo beside the title, a strip down one side, two full-height columns, a row of three values left, centre and right. Some parts span several rows, such as a strip down the whole page, and some span several columns, such as a title under a logo and a date.

<!-- stanza: #hky9r022qp -->
## Decision

<!-- stanza: #2f7n2w52jf -->
### The grid

A cover with `areas` is a grid:

```yaml
cover:
  margins: { top: 36, left: 48, right: 48 }
  columns: [1fr, 140]
  rows: [90, 2fr, 1fr, 110]
  areas:
    - logo   number
    - title  title
    - .      .
    - table  status
  area:
    logo:
      content:
        - { image: assets/logo.png, width: 140, style: cover-logo }
    number:
      content:
        - { style: cover-number, text: '[](stanza:field:document-number)' }
    title:
      valign: bottom
      content:
        - { style: cover-title, text: '[Untitled](stanza:title)' }
```

- `columns` is a list of widths: points, or shares written `<n>fr` of what the columns in points leave of the width of the cover page. A column cannot grow with its content, since Word lays out a table of fixed columns. Left out, there is one column of the whole width.
- `rows` is a list of heights, as in ADR 0089: points, shares, or `auto` for a row that grows, and shares and rows that grow cannot be mixed.
- `areas` has a line for each row, with a name for each column, as `grid-template-areas` in CSS. A name is kebab-case; `.` is a cell that belongs to no area. The cells of one name must form a rectangle. A line with the wrong number of names, or a name that is not a rectangle, is an error (`cover-areas-shape`).
- `area` gives the areas their content: a vertical alignment (`valign`, `top` by default) and a list of the entries of ADR 0019 and ADR 0089. A name in `area` that `areas` does not have is an error (`unknown-cover-area`). An area without content is left empty, and holds its place.
- A cover with `areas` has its content only in `area`: rows are heights, not entries. The rows of ADR 0089, with `content` in each row, stay valid and are a grid of one column.

<!-- stanza: #phhts6j8zj -->
### Export

The grid is the borderless layout table of ADR 0089 with a column for each column, whose widths are computed from the cover page as the row heights are, with the last share column taking what rounding leaves. An area is one cell: it spans its columns with `gridSpan` and its rows with `vMerge`, and its vertical alignment applies to the whole cell. A `.` is an empty cell. An image is at most as wide as its area, and the warning for an image that is taller than its row compares it to the rows of its area.

<!-- stanza: #k6xjv64dbz -->
### Preview and editing

The editor and the style editor draw the grid as a CSS grid with the same columns, rows and areas. Editing the grid in the style editor is item 230: until then the Pages panel shows that the cover is a grid, and that it is edited in the text, and does not change it.

<!-- stanza: #a8q600q53b -->
### Format

The stylesheet stays at format version 1, since `columns`, `areas` and `area` are additions.

<!-- stanza: #ebp58ykpf0 -->
## Consequences

- A logo beside a title, a strip down one side, and values side by side can be placed, and with the colors of item 226 most covers of the corpus are reproduced.
- The areas show the layout in the stylesheet itself, as a small picture of the page.
- A cover has two forms of rows: with content (one column) and without (a grid). The second is the general one.

<!-- stanza: #demkf1e7yr -->
## Alternatives considered

- **Cells in each row, with a column and a row span, as in an HTML table.** Closer to Word, but a part that spans rows must be counted in every row below it, and the shape of the page is hard to see.
- **Columns that grow with their content.** Word can autofit a table, but then the widths depend on the text, and the cover would differ between Word and the preview.
- **Areas that overlap.** A table cell cannot overlap another, and the corpus has one cover (Motion) that needs it.

<!-- stanza: #m76w389ak8 -->
## Not covered

Area backgrounds (item 226), editing the grid in the style editor (item 230) and importing a grid from a template (item 229).
