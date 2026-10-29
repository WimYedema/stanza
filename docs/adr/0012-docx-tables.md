# ADR 0012: DOCX tables and page breaks in styles

Status: Accepted

## Context

Tables need a table style (borders, padding, header row) that the `docx` library cannot define, and the library cannot write `page-break-before` into a paragraph style. ADR 0008 accepted a per-paragraph workaround for the page break and left the table style open (ADR 0006 defines the table style properties). This record covers both and replaces that workaround. ADR 0008 stays as accepted.

## Decision

### Table styles

The exporter generates the XML of every declared table style and gives it to the library as external styles. The values are the resolved ones: borders (outer to the four sides, plus inside horizontal and vertical, in eighths of a point), cell padding on all four sides, and the header row as first-row conditional formatting (text properties and background). A table style is written without `basedOn`, because the merging of inherited borders in Word is unclear, so a derived style repeats what it inherits.

### Cells

A table style has an optional `cell-style` property (ADR 0006 gains it as an additive change, so the format stays at version 1), the paragraph style of the text in cells. Absent means `body`. It is inherited through `based-on`. Cell marks are checked against the cell style. A cell style that is not a paragraph style is an error (`unknown-cell-style`).

### Header row

The first row is the header. A table style's `repeat` makes it repeat on every page. All rows are kept whole across page breaks. The table look turns on the first-row formatting and no banding.

Word lets the paragraph style win over the table style, so a header property that the cell style also sets would not apply. The stylesheet validation warns about this (`header-property-overridden`).

A bold header comes from the table style, and Word combines a bold in the table style with a bold in a character style by an exclusive or (ADR 0008). Marks in header cells therefore compute their run styles against the cell style plus the header text properties. These generated styles have their own IDs, such as `TableCellTableHeaderEmphasis`. For this, `resolveTextProps` takes an optional base.

### Widths

Without `widths`, the table is the full text width with autofit layout. With `widths`, the weights become percentage cell widths in the same layout. Item 15 checked that the library writes both.

### Tables around other blocks

Two tables that touch merge in Word, and Word wants a paragraph after a table at the end of the document. The exporter writes an empty paragraph in the `body` style after a table that is followed by a table or ends the document.

### Bookmarks

The ID of a table (ADR 0009) is a bookmark around the content of its first header cell.

### Tables in list items

Not supported yet. Their indent and width need the same work as code blocks in list items, which is a separate backlog item. A table in a list item is `docx-unsupported-block`.

### Page breaks in styles

After the package is packed, `page-break-before` is added to the generated paragraph styles that set it, in schema order after `keepNext` and `keepLines`. A style given as XML would replace the declarative one, so writing only this property that way would mean writing every such style by hand. The per-paragraph property of ADR 0008 is no longer written, and a derived style inherits the break through `basedOn`.

## Consequences

- Tables look the same in Word as in the stylesheet, from named styles, with no direct formatting in cells.
- A derived table style must be re-generated when its base changes, which the exporter does on every build.
- The patch of `styles.xml` is one more post-processing step next to the deterministic-output steps.

## Alternatives considered

- **Header text in a generated paragraph style.** More robust against Word's precedence rules, but it needs a generated style for every table style and cell style pair.
- **Cells in `body`.** Cells would get the paragraph spacing of body text, which looks wrong in a table.
- **Table styles with `basedOn`.** Closer to the stylesheet, but it relies on how Word merges borders.
- **All paragraph styles written as XML.** One path for styles, but it would duplicate the property mapping of the library and rewrite all of it.
