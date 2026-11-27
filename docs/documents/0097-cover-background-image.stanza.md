---
stanza-format: 1
title: "ADR 0097: Cover background image"
---

<!-- stanza: #2g8j0pwz2n -->
# ADR 0097: Cover background image

Status: Accepted. Backlog item 227, refining ADR 0089 and ADR 0092. Decided with the product owner on 2026-11-27.

<!-- stanza: #x1cpwge9f6 -->
## Context

Rows, grids and their background colors (ADR 0089, ADR 0092, ADR 0093) reproduce covers that are made of rectangles. Seven of the nineteen corporate covers that the cover work started from also have gradients, curves, slanted facets or ornaments, which no grid can draw. Word draws them as shapes or as a picture behind the text. The vision excludes content that floats, since it makes layout depend on where Word happens to put things.

<!-- stanza: #ad28g3rnv0 -->
## Decision

- **A cover of rows or a grid can have one background image:** `background-image: assets/cover.png`, a PNG or JPEG of the project. It fills the whole cover page, from edge to edge, behind everything on it; the margins of the cover do not apply to it. A cover that is a list has no keys of its own, so it has none.
- **The image is stretched to the page.** It is not cropped and keeps no proportions of its own. When its proportions differ from those of the page by more than 2%, the project warns (`image-aspect`) and says how wide it should be for its height, so that the person makes the picture once in the proportions of the page.
- **It is the one floating picture Stanza writes.** In Word it is a picture anchored to the page at its top left corner, as large as the page, behind the text, without wrapping, locked to its anchor, and marked as decorative, as the other pictures of a cover are. Its anchor is in the paragraph that ends the cover section, which is one point high, so the picture takes no line and the rows keep their heights. Everything else on the cover stays in its rows and areas.
- **Loading and checks** are those of the other images of a cover: it is read with them, a missing file or one that is not a PNG or JPEG is an error, and the path must be a safe relative path.
- **The preview and the editor** draw it behind the cover sheet, stretched to it. In the style editor, the cover page has a field for it beside the margins of the cover, with the images of the project to choose from. It stays when rows become a grid and back.

<!-- stanza: #dywyr16n8f -->
## Consequences

- Covers with gradients, curves and slanted shapes are reproduced with a picture made once, and their text stays in rows and areas that the stylesheet controls. With this, eighteen of the nineteen covers can be reproduced.
- A picture in other proportions looks stretched, and the warning says so before anyone sees it in Word.
- The import of a cover from a template does not yet take a picture behind the text of its first page; that belongs with the import of anchored shapes (item 229).

<!-- stanza: #qg44xzxj5k -->
## Alternatives considered

- **Keeping the proportions and cropping the picture to the page.** Forgiving for the person, but the crop would have to be computed and written into the picture's properties, and the preview would have to crop the same way.
- **A choice per cover between stretching and cropping.** The most flexible, and the most to build and to explain, for a picture that is made for one page size anyway.
- **A paragraph of its own for the anchor, before the rows.** Simpler to write, but it takes a line, which moves every row down.
