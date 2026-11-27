---
stanza-format: 1
title: "ADR 0093: Cover area backgrounds"
---

<!-- stanza: #00f8dp20km -->
# ADR 0093: Cover area backgrounds

Status: Accepted. Backlog item 226, after ADR 0089 and ADR 0092. Decided with the product owner on 2026-11-25.

<!-- stanza: #1x7xpwbrzg -->
## Context

With rows and areas (ADR 0089, ADR 0092) the parts of a cover are where they belong, but most covers of the corpus (spike findings, "Cover corpus") are recognised by their colors: a band across the top, a strip down one side, a dark block with white text, a thin colored rule. Word's own covers draw these as filled rectangles behind the text.

<!-- stanza: #8fe6prmr9f -->
## Decision

- **A row of a cover (ADR 0089) and an area of a grid (ADR 0092) can have a `background`:** the name of a color token. As everywhere in the stylesheet (ADR 0065), a raw `#RRGGBB` is reported and a token that does not exist is an error.
- **The color fills the whole row or area,** to the margins of the cover. A cover with margins of 0 has bands that run to the edges of the page. An area that spans rows is filled as one.
- **A rule is a thin row or column with a color,** such as a row of 5 points. Covers need no paragraph or cell borders.
- **Text on a color takes its color from its paragraph style,** such as a style with white text for a dark band. The background does not change the text.
- **Export:** cell shading of the token's color on the cell of the row or area. **Preview:** the background color of the row or area, in the editor and in the style editor.
- **The Pages panel** has a background for each row, chosen from the color tokens or none. The background of a grid area is edited in the panel since ADR 0096.
- A gradient is approximated by one color, or is a background image (item 227).

The stylesheet stays at format version 1.

<!-- stanza: #a5mnan8pww -->
## Consequences

- With ADR 0092, 11 of the 19 covers of the corpus are reproduced and the others approximated.
- A printer that cannot print to the edge leaves a white rim around a band that runs to the edge; a PDF and the screen show it whole.
- A change of a color token changes the bands of every cover that use it.

<!-- stanza: #340bh5zfvb -->
## Alternatives considered

- **A background on an entry, such as a paragraph.** It would color the paragraph and not the part of the page it sits in, and paragraph backgrounds already exist in styles.
- **Borders of rows and areas.** The corpus draws its rules as filled shapes, and a thin row does the same with one concept less.
