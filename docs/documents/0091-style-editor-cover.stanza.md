---
stanza-format: 1
title: "ADR 0091: The style editor, cover and title block"
---

<!-- stanza: #eam0tr5as7 -->
# ADR 0091: The style editor, cover and title block

Status: Accepted. Backlog item 193, refining ADR 0051. Decided with the product owner on 2026-11-25.

<!-- stanza: #t9mag09wqg -->
## Context

ADR 0051 left the cover of a page template to the text of the stylesheet, since its entries are a list of mixed kinds that need a panel of their own. Since then the cover can be divided into rows with heights, alignment, margins and images (ADR 0089), and a template can have a title block (ADR 0090). Writing these in YAML by hand is where most of the mistakes of a cover are made, and the editing of the other parts of a template is in the Pages tab already.

The edits of the style editor change one property of the text at a time by its path in the mappings (ADR 0035). A cover is mostly lists, of rows and of entries, which have no names to make a path of.

<!-- stanza: #evpqqteb3a -->
## Decision

<!-- stanza: #zfbwjxt5nv -->
### Panel

The Pages tab gets two groups below the header and footer, **Cover** and **Title block**:

- **Cover** starts with its kind: none, a list of entries (ADR 0019), or rows (ADR 0089). Changing between a list and rows keeps the entries: a list becomes one row that grows, and rows become one list in order. Rows have the margins of the cover, four numbers that are left empty to take the margin of the template.
- **A row** has its height, written as in the stylesheet (`100`, `2fr`, or empty for a row that grows), its alignment, and its entries. Rows can be added, moved up and down, and removed.
- **The title block** is a list of entries, or none.
- **An entry** is a paragraph (its style and its text with the insert list of ADR 0051), a table (its style, and its rows of a label and a value with the insert list), or an image (its path, chosen from the PNG and JPEG files of the project or typed, its width in points or empty for its own size, and its style). Entries can be added at the end of a row or list, moved up and down within it, and removed.
- Styles are chosen from the declared styles of their kind, so the panel cannot make direct formatting, and positions are only rows, so it cannot make free positioning.

<!-- stanza: #k6hd5rn96w -->
### Edits

A change in the panel writes the whole `cover` or `title-block` of the template again, from the model, in one form: block YAML, two spaces of indentation, keys in a fixed order, and slot text as `slotSource` writes it. The writing is in `format`, next to the reading, and a test reads what it writes. The host applies it with a new edit, `setBlock`, which replaces the lines of that property, or adds it to the template, and refuses the result if it has an error that the text did not have, as `setProperty` does. The other lines of the stylesheet, with their comments, stay as they are. Comments inside the cover or the title block do not survive an edit made in the panel.

<!-- stanza: #4maqed30jz -->
### Preview

While a page template is shown, the desk of the style editor shows its cover and its title block as the document editor draws them (item 222), with sample metadata: the title, the authors and the classification have sample values, and a custom field shows its name. The host sends the PNG and JPEG files of the project as data URLs, which serve the preview and the list of images to choose from.

<!-- stanza: #17b0bpng4p -->
## Consequences

- A cover and a title block can be made and changed without writing YAML, with the result shown beside the panel.
- The text of a cover is rewritten in one form by the first change in the panel, so its diff in Git shows the whole cover once.
- An invalid state that a panel can reach, such as a share beside a row that grows, is refused by the host with its diagnostic, as other edits are, and the panel shows the stylesheet as it is.

<!-- stanza: #m2y6wwemp4 -->
## Alternatives considered

- **Paths with list indexes, such as `rows.1.content.0.text`, for `setProperty`.** It would keep comments inside a cover, but every move of a row or an entry would be several edits that must all succeed, and the edit code would have to place items in block and flow lists.
- **A cover editor of its own, outside the Pages tab.** The size and margins of the template decide the space of the cover, so they belong in the same place.
- **Presets.** Starting from a preset is item 228, after this.

<!-- stanza: #yx8x4hhyss -->
## Not covered

Columns and areas (item 225), background colors (item 226), a background image (item 227), presets (item 228) and adding, renaming or removing page templates.
