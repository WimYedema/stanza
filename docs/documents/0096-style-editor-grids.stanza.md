---
stanza-format: 1
title: "ADR 0096: Editing grids in the style editor"
---

<!-- stanza: #yt9yq3kv02 -->
# ADR 0096: Editing grids in the style editor

Status: Accepted. Backlog item 230, refining ADR 0091, ADR 0092 and ADR 0095. Decided with the product owner on 2026-11-27.

<!-- stanza: #bp1932v50r -->
## Context

The Pages panel edits a cover of rows (ADR 0091), but a cover grid (ADR 0092) and a header or footer grid (ADR 0095) are only shown there, and are edited in the text of the stylesheet. Grids are what `stanza import cover` makes (ADR 0094), so an imported cover cannot be changed in the panel at all. The `areas` of a grid are a small picture of the page in text; they are easy to read and easy to get wrong, since every line needs a name for each column and the cells of a name must form a rectangle.

<!-- stanza: #t7d605r5cs -->
## Decision

<!-- stanza: #fb2add5mrm -->
### The panel holds the numbers

- **Kind.** The cover gets a fourth kind, a grid. Rows become a grid of one column with an area for each row (`row-1`, `row-2` and so on), and a list becomes a grid of one area; nothing is lost. A grid of one column becomes rows again, an area for each row; a grid of several columns becomes a list of its entries in the order of the areas, which loses the places, as a change of kind from rows to a list does. A header or footer chooses between three slots and a grid; slots become a grid of three columns with the text of each slot in its own area, and a grid becomes slots that are empty.
- **Columns and rows** are lists of widths and heights, written as in the stylesheet (`225`, `1fr`, empty for a row that grows). A column or row can be added at the end, inserted after another, and removed. A new column or row has cells of no area. Removing one removes its cells: an area that spanned it gets smaller, and an area that had no other cells is removed with its entries.
- **Areas** are listed in the order in which they first appear in the grid, each with its name, its alignment, its background (ADR 0093) and its entries, edited as the entries of a row are (ADR 0091). A name can be changed; it must be a name the stylesheet accepts and not that of another area.
- The cover keeps its margins; a header or footer keeps its style and its distance.

<!-- stanza: #kdxg1v88gm -->
### The preview draws the areas

- While a page template with a grid is shown, the preview draws the lines of the grid over the cover, and the name of each area in its corner. Rows that grow with their content are at least one line high in the preview, so that an empty row can be reached.
- **A drag across cells selects a rectangle of them.** With a selection, the preview offers: a new area of those cells, adding them to an area when the area and the cells together make a rectangle, and clearing them. Cells taken from another area leave that area; when what is left of it is not a rectangle, the change is refused with that reason, and when nothing is left, the area is removed with its entries.
- **A click on an area selects it** in the panel and scrolls to it; a selected area is marked in the preview.
- A header or footer that is a grid is drawn on the body page at its distance from the edge, and is edited in the same way.
- **The preview shows what can be done.** A cell under the mouse is lit and has a crosshair, the area under the mouse is outlined, and while a grid is shown a bar above the preview says what a drag and a click do; with a selection, the same bar offers the actions.
- **The preview shows what a field sizes.** While the cursor is in a field of a size, a red arrow with the length in points spans what it sizes: a column or a row of a grid or of rows, a margin of the cover or the body pages, or the distance of the header or footer from the edge.

<!-- stanza: #gzzv502f0s -->
### The layout and its parts

A page template is the layout of every document that names it, cover included, so the style editor shows it that way. The product owner added this on the same day, after trying the first version, in which a template showed its cover, title block, header and footer all at once.

- **The tab is Page layout, and it lists the two parts of a layout: Cover page and Body pages.** Each part has its panel and its preview of its own: the cover page shows the kind of cover, its margins and its rows or grid; the body pages show the size, the margins, the header, the footer and the title block, and the preview shows one whole body page with them. The cover page shows the size it shares with the body pages.
- **The layout is chosen at the top of the panel,** less prominent than the parts. With one layout it is a name; with several it is a list, in which the default layout, the one a document gets without `page-template`, is marked "default". The panel says that its settings shape every document that uses the layout.
- **The style editor starts on the layout of the document it was opened from** with Edit Styles, and says which document uses it. The layout of a document is its own `page-template`, else the default of the project, else the default layout.
- The model does not change: the cover stays part of the template, since a document chooses one layout, cover included. Covers that several layouts share would be a change of the model, for when that is needed.

<!-- stanza: #8x8xxb3ytk -->
### Edits

Every change writes the whole `cover`, `header` or `footer` of the template again in the one form of ADR 0091, with `setBlock`; the writing of a header or footer, with its style, its distance and its grid, is `headerFooterSource` in `format`, which `stanza import cover` also uses. The changes to a grid are functions of `core` that take a grid and give a new one or the reason why not, so the panel and its tests share them. The host refuses a result with an error, as for other edits, and Undo in the editor of the text gives the previous version back.

A change of kind that loses what was made is asked first, in the panel, since a webview cannot show a dialog: a cover that becomes none, rows or a grid that become a list, and a header or footer grid that becomes slots. The question says what goes. Changes that keep everything are made at once: rows become a grid and back, and a list becomes rows or one area.

<!-- stanza: #njyp017cef -->
### Out of scope

- Dragging the lines of the grid to change widths and heights: the numbers are in the panel. Dragging would have to round to clean numbers and to choose between points and shares.
- The background image of the cover (item 227), which does not exist yet.

<!-- stanza: #ab6tednt93 -->
## Consequences

- An imported cover, header or footer can be changed in the panel, and a grid can be made without writing `areas` by hand.
- An area is always a rectangle and every line always has a name for each column, because the panel only makes what `placeAreas` accepts.
- As in ADR 0091, comments inside a cover, header or footer do not survive a change made in the panel.

<!-- stanza: #j6nhppphr9 -->
## Alternatives considered

- **Only the panel, with a list of area names for each cell.** The least work, but a span of three columns is three choices that must agree, and the person does not see the page while choosing.
- **Dragging the lines as well.** The most natural, but the most work, for numbers that are easy to type.
