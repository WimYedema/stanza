---
phrase-format: 1
title: "ADR 0059: Banded table rows"
---

<!-- phrase: #x1wm1e56yz -->
# ADR 0059: Banded table rows

Status: Accepted

<!-- phrase: #km96kssjpn -->
## Context

A table style could not alternate the background of its rows, and shading cells by hand is direct formatting, which the product does not allow (ADR 0006).

<!-- phrase: #6tr8es8s4t -->
## Decision

- **Property.** A table style takes `banded-rows` with `odd` and `even`, each a color (a `#RRGGBB` value or a color token, as the header row background). Either may be given alone. Bases merge them one by one, as for the header row.
- **Which rows.** The header row is not counted: the first body row is odd. A table without a header row starts with its first row.
- **Validation.** A color token that does not exist is `unknown-token` at `banded-rows.odd` or `.even`.
- **Browser CSS** (ADR 0021). Rules on `td` by position, with `:has` to tell a table with a header row from one without. Cells are not shaded one by one.
- **DOCX** (ADR 0012). `band1Horz` (odd) and `band2Horz` (even) in the table style with cell shading, and `w:tblStyleRowBandSize` 1. Without the band size Word draws no bands (tried in Word). The table look has `noHBand` false only when the resolved style has bands. No shading in the cells of the document.
- **Style editor** (ADR 0040). A group "Banded rows" with the two colors, shown as own or from a base, with a button to take one off; the style card gets "Odd rows" and "Even rows".

<!-- phrase: #1spzqqe9a5 -->
## Consequences

- Bands of more than one row, vertical bands and last-row or first-column formatting are not offered.
- A cover table with the style is banded as well.
- Colors are still free values; the theme-only rule is a separate backlog item.
