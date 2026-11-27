---
stanza-format: 1
title: "ADR 0098: Importing shapes anchored to the cover"
---

<!-- stanza: #zb48zk64hq -->
# ADR 0098: Importing shapes anchored to the cover

Status: Accepted. Backlog item 229, refining ADR 0094. Decided with the product owner on 2026-11-27.

<!-- stanza: #29ddyp8vvx -->
## Context

ADR 0094 imports the cover of a template from its flow: paragraphs, tables and frames. Most covers are not built that way. Fourteen of the sixteen covers of Word's own gallery are text boxes and shapes anchored to the page: bands and blocks filled with a color, text boxes on them with the title and the author in content controls, and pictures. Ten of them put these in one group. Before this, the import put a text box in the flow where it was anchored, and a cover of shapes came out as a list of lines.

<!-- stanza: #jynqtwz94r -->
## Decision

- **A drawing anchored to the first page is a shape on the page,** in the body and in the first-page header and footer, and is not put in the flow. Its place is read from the anchor: an offset, an alignment or a percentage, from the page, the margins or the margin areas, also where Word puts the percentage in `mc:AlternateContent`; its size from the extent, or a percentage of the page. A shape placed from its paragraph is placed from the top margin, and reported.
- **A group is taken apart.** Its rectangles, text boxes and pictures are placed on the page through the offset and scale of the group, and of the groups inside it.
- **What a shape becomes:** a text box becomes an area with its paragraphs, read as other paragraphs are, with content controls as tokens and the vertical alignment of the box; a filled rectangle becomes a background color (ADR 0093); a picture becomes an image entry in an area; a picture behind the text that covers most of the page becomes the background image of the cover (ADR 0097). A fill is a given color, a theme color with its changes of luminance, or the fill of the shape's style; a gradient becomes its first color, and is reported.
- **Left out and reported:** other forms than a rectangle, drawn shapes, lines and fills of a picture or pattern. A text box of another form becomes a rectangle, and that is reported. A rotated shape is placed upright.
- **One grid over the whole page.** The shapes and the flow, at the places the estimated heights give it, are laid out together as one grid without margins: the edges of all of them are the lines of the grid, edges within two points are one, and lines that part nothing are left out. The widest column and the highest row take what the others leave, so the grid fits the page.
- **Overlaps:** a shape in front takes its cells. A text box without a fill takes the color behind most of it, so text on a band stays on the band. What is left of a colored shape becomes areas of that color, so a band with a text box on it still looks whole. A shape with text behind another keeps the largest rectangle of what is left of it, and that is reported.
- **Names:** an area with text is named after the first value it shows, such as `title` or `authors`, else `box-1` and so on; an area of a color is `band-1` and so on.

<!-- stanza: #wa12nfxcek -->
## Consequences

- The covers of Word's gallery import with their bands, blocks, text boxes and pictures where Word has them. Checked by hand against all sixteen, they come out close, apart from curves, gradients and ornaments, which a grid cannot draw.
- A cover of shapes becomes a grid with more lines and areas than one written by hand; the areas are named after what they show, so they can be found in the style editor.
- The padding inside a text box is not kept, since an area has none: text sits at the edge of its area.

<!-- stanza: #eh38566hp1 -->
## Alternatives considered

- **Leaving groups out, as the backlog item said.** Ten of the sixteen gallery covers would have lost their bands and text.
- **Cutting what is behind a text box,** keeping only the largest rectangle of a band. Bands would have holes.
- **Drawing the shapes that a grid cannot have into the background image.** It would keep curves and gradients, but needs a way to draw them: Word itself, a PDF the person makes, LibreOffice, or a renderer of our own. That is item 237, to consider later.
