---
phrase-format: 1
title: "ADR 0037: The style editor, paragraph panel"
---

<!-- phrase: #pwsy4g3wwc -->
# ADR 0037: The style editor, paragraph panel

Status: Accepted

<!-- phrase: #z60xxk38rf -->
## Context

The shell of the style editor (ADR 0036) shows the styles but changes nothing. The stylesheet is the single source of the look (ADR 0006), the list of properties (ADR 0033) says what each property is, and `setProperty` and `unsetProperty` (ADR 0035) change the text without losing comments. This record joins them for paragraph styles.

<!-- phrase: #hbqwehq5ec -->
## Decision

<!-- phrase: #ce9hetwamg -->
### One control for each property, chosen by its type

For a selected paragraph style the side of the editor shows a panel, in place of the read-only detail. It has these groups:

- **Style**: the label (ADR 0034) and the base style.
- **Text** and **Spacing and alignment** and **Flow**: one row for each property of `TEXT_PROPERTIES` and `PARAGRAPH_PROPERTIES`, in the order of the list. The control comes from the type: a number with its unit, a list of yes and no for a flag, a list for a choice, a text field with the theme's token names offered for a color or a font (families are typed separated by commas), and a rule with a number for the line spacing.
- **Marks**: for strong, emphasis, code and link, a list of allowed or not allowed (ADR 0026). The properties of a declared variant are shown under it, and those of the marks that are off or not declared are hidden.

The panel is built from the list of properties, so that a property added to the list shows up without work on the panel.

<!-- phrase: #kahr5rce5q -->
### Own and inherited

A row shows what the style sets itself. When it sets nothing, the control is empty and shows what the nearest base that sets it gives, in the placeholder of the field or in the first option of the list, and the row says from which base. A property that the style sets has a button to take it off. Nothing is copied from a base into the style: the panel only reads the resolved values.

<!-- phrase: #7se4m5x5te -->
### Changes are edits of the open file

A change in a control sends a message with the path and the value, or the path alone to take the property off. The host makes it with `setProperty` or `unsetProperty` and applies the result as an edit of the open text document, the changed lines only, so the undo of VS Code takes it back and the text shows the change at once. A result that the stylesheet rules refuse, or that introduces a new error, is not applied, and the host answers with `edit-refused` and its reason, which the panel shows and clears at the next change. The edit does not save the file.

A number that is emptied takes the property off. A mark that is allowed gets the usual variant (`DEFAULT_VARIANTS`), which can then be changed property by property.

<!-- phrase: #hr6x4k5px7 -->
### The panel does not fight the person

The text of the stylesheet comes back from the host after every change and the panel is updated in place, not rebuilt, so that the focus stays where it is. The file is the truth: every control is overwritten with what the file says, also the one that has the focus, so that an undo or a refused value shows at once. A control only sends on `change`, so typing is not interrupted by an update. The panel is built again only when another style is selected.

<!-- phrase: #mgk45aejx1 -->
## Consequences

- A paragraph style can be changed without writing YAML, and the comments and layout of the file stay.
- The panel shows only what the file says. A property the panel cannot show for a style, such as an invalid value, is a matter of the diagnostics of the stylesheet, which stops the shell from showing it at all (ADR 0036).
- The panel is tested in jsdom against the messages it sends. How it looks and feels in VS Code is judged by hand.
- Character styles, table styles, the theme and the page templates have no panel yet; they come with the next items. Headings and list styles use this panel, and their special properties are added to it by the next item.

<!-- phrase: #tzvk1hnrbv -->
## Alternatives considered

- **Native VS Code UI, such as a quick pick or a form view.** It cannot be put beside the sample document, which is the point of the editor.
- **Rebuilding the panel after every message.** It is simpler, but takes the focus and the cursor away from a field being typed in.
- **Writing the whole stylesheet from a model after a change.** It would lose comments and the person's layout, which ADR 0035 exists to avoid.
