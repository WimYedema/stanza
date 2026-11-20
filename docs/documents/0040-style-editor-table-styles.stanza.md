---
stanza-format: 1
title: "ADR 0040: The style editor, table styles"
---

<!-- stanza: #bb41ha6yc0 -->
# ADR 0040: The style editor, table styles

Status: Accepted

<!-- stanza: #9v58bg1det -->
## Context

A table style has fewer properties than a paragraph style, but they are nested: a cell style, a cell padding, three borders that each have a width and a color, and a header row with text properties, a background and a repeat flag (ADR 0006, 0012). The panel of ADR 0037 shows flat properties of paragraph and character styles.

<!-- stanza: #hcahrvvyvn -->
## Decision

The panel shows a table style selected in the Tables tab, in these groups, with the types taken from the property list (ADR 0033):

- **Style**: the label and the base style, which is a table style.
- **Table**: the cell style, chosen among the paragraph styles, and the cell padding.
- **Borders**: the outer border, the inside horizontal and the inside vertical. Each is one row with a width and a color (a theme token or a hex value, as for text).
- **Header row**: the background, repeat, and the text properties of the header row, each a row of its own.

<!-- stanza: #dcdg5yxymn -->
### A border is one unit

The file needs both a width and a color for a border, and a table style based on another replaces a whole border of its base, since borders merge side by side and not property by property (ADR 0012). The panel follows this. A change of the width or the color writes the whole border to the side's path. The half that has not been given is taken from the border of the base, or else from a default (0.75 pt, black), so that a change never makes a file with an error. Emptying a field of a border that the style has, a width of 0, and the button take the border off, since a border with one half is not valid. For a border that the style does not have yet, only a field that is left empty is filled in. The inherited border is shown in the placeholders and the note says from which base it comes.

A derived style has no way to say "no border" where its base has one, because the model has no such value. That would be a model change and is not part of this item.

<!-- stanza: #373897b62y -->
### The header row is by property

The header row merges property by property, so each of its rows has its own and inherited state, and an edit writes one key under `header-row`, which `setProperty` makes when it is missing (ADR 0035).

<!-- stanza: #64fsg44y86 -->
### Mechanics

The reading of a value and its base is one function, `stateBy`, that takes the way to read a value from a style. The text and paragraph properties use it through `stateOf`, and a table style uses it with a reader for each value. The path of an edit starts with the section of the kind of the style. A panel tells the page when it is shown, and the read-only detail is hidden then, for all three kinds.

<!-- stanza: #89sf73bwxf -->
## Consequences

- Every property of a table style can be changed without YAML, with undo and with refusals shown.
- Borders cannot be removed from a derived style, as above.
- The sample document shows each table style, as the shell did (ADR 0036).
- Adding and deleting table styles comes with the item on adding styles.

<!-- stanza: #hht87ft9b6 -->
## Alternatives considered

- **Separate rows for the width and the color of each border.** One could be written without the other, which the file does not accept, and the panel would have to explain the refusal.
- **A separate panel for tables.** The controls, the own and inherited display and the edits are those of the other panels, and only the groups differ.
