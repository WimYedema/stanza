# ADR 0050: The style editor, theme

Status: Accepted

## Context

The Theme tab of ADR 0036 lists the color and font tokens and shows their values read only. The panels of ADR 0037 to 0040 edit styles with edits of the text of the stylesheet (ADR 0035). A token is the one place where a color or a font family is written, so changing it recolors or sets in another font everything that refers to it.

## Decision

- **The value of a token is edited in a panel under the list**, as for a style. A color token has a color field and a swatch (the color chooser of the browser); a font token has a field for its families, separated by commas. A change is sent as a `set` of `tokens`, `colors` or `fonts`, and the token name, which the host makes in the text with the edit of ADR 0035, so the comments and the order of the file stay.
- **A new token is made with a form** in the same panel: its kind, its name and its value. It is added to the end of its mapping.
- **Checked in the panel before it is sent**: a color is `#RRGGBB` (written in capitals, as the fixtures do), a font has at least one family, a name is in kebab-case and not taken by a token of the same kind. The host checks the result as it does for any edit (ADR 0035), so a page that sends something else gets a refusal.
- **No renaming and no removing.** Styles refer to tokens by name, so both need the usage index (backlog item 61). Both stay in the text.
- **A color token is a color, not another token**: a token that refers to a token is not made, since the stylesheet does not read one (ADR 0006).
- The panel shows for the Theme tab only, with the form even when no token is selected. The read only detail is hidden while it is shown, since the panel says the same.

## Consequences

- A person can recolor a project, or change its fonts, with the style editor and see the sample change.
- The list of the tab and the detail keep working from the stylesheet, and the panel is drawn again after every change of the text, so an undo is shown.
- A token that no style uses is not marked. That comes with the usage index.

## Alternatives considered

- **Putting the token controls in the panel of styles.** That panel is built from the list of properties of a style (ADR 0037), and a token has no properties of that kind, so the code would be a special case in it.
- **Allowing any CSS color.** The stylesheet takes hex colors only (ADR 0006), and the export needs a value it can write in every format.
