---
stanza-format: 1
title: "ADR 0095: Header and footer grids"
---

<!-- stanza: #6rh2kq73n0 -->
# ADR 0095: Header and footer grids

Status: Accepted. Backlog item 216, refining ADR 0016 and ADR 0017. Decided with the product owner on 2026-11-26.

<!-- stanza: #an6qq6xbc1 -->
## Context

The header and the footer of ADR 0017 are one line in three slots, at the library's 1.25 cm from the edge of the page. Corporate templates do more: the header of the body pages of a technical report template has a logo, the title of the template with its revision, and the date; its footer has the page number and the classification; and its header and footer sit at 1 cm from the edge. The cover already has what this needs: a grid of areas with entries, images and colors (ADR 0089, ADR 0092, ADR 0093).

<!-- stanza: #faaa344zj0 -->
## Decision

- **A header or a footer can be a grid,** written with `columns`, `areas` and `area` as a cover grid, in place of `left`, `center` and `right`. Its entries are those of a cover: paragraphs with tokens, tables of labels and values, and images. Unlike on a cover, its paragraphs may show the page fields `page`, `pages` and `section` (ADR 0017), which are written as Word fields.
- **Its rows grow with their content, or have a height in points.** `rows` may be left out: each line of areas is then a row that grows. A share (`fr`) is an error (`header-row-share`), since a header has no height to share.
- **A slot form and a grid form do not mix:** a header with `areas` has no slots.
- **`distance`** gives the distance of the header from the top edge of the page, or of the footer from the bottom edge, in points, for both forms. Left out, it is 1.25 cm, as before.
- **Export:** the grid is the borderless layout table of the cover, as wide as the text, followed by the paragraph that Word needs at the end of a header or footer, made one line of 1 pt as at the end of a cover. Pictures in headers and footers are numbered with those of the document and marked as decorative, so the output stays the same for the same input.
- **Preview:** the editor draws the grid in the band of the header or footer, at its distance; page fields show their labels, as in the slots.
- **Editing:** the Pages panel sets the distance of each; a header or footer that is a grid is edited there too since ADR 0096.
- **The revision of a template** is written with the `version` token, or a custom field, and not with Word's `REVNUM` field, which counts the saves of a file and would differ between builds of the same source.

The stylesheet stays at format version 1.

<!-- stanza: #f20e4jmhtx -->
## Consequences

- A logo in the header, two lines of title and subtitle, and a page number beside a classification can be written, and moved closer to the edge.
- One grid model serves the cover, and now the header and the footer.
- A different first page and odd and even pages stay outside, as the vision says.

<!-- stanza: #pfwh5phag3 -->
## Alternatives considered

- **More slots, or slots of several lines.** Less general than the grid, and a logo still has no place.
- **A header written in Word and copied in.** Word would be a build input (ADR 0094 refuses that for covers too).

<!-- stanza: #4y7v06bf80 -->
## Not covered

Editing a header or footer grid in the style editor (item 230), and importing the headers and footers of a template (ADR 0094 leaves them out).
